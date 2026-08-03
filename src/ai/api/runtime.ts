import crypto from 'node:crypto';
import { 
  APIRequest, 
  APIResponse, 
  APIContext, 
  APIErrorCode, 
  RouteMetadata, 
  Middleware, 
  RateLimiter, 
  APIException 
} from './types';
import { RouteRegistry, MiddlewareRegistry } from './registry';
import { featureFlags } from './config/featureFlags';

export class APIGatewayRuntime {
  private idempotencyCache: Map<string, APIResponse | 'IN_PROGRESS'> = new Map();
  public metrics: Array<{
    requestId: string;
    latencyMs: number;
    status: number;
    errorCode?: APIErrorCode;
    cancelled: boolean;
  }> = [];

  constructor(
    private routeRegistry: RouteRegistry,
    private middlewareRegistry: MiddlewareRegistry,
    private rateLimiter: RateLimiter
  ) {}

  public async handleRequest(
    method: string,
    path: string,
    request: APIRequest,
    overrideContext?: Partial<APIContext>
  ): Promise<APIResponse> {
    const startTime = Date.now();
    const requestId = overrideContext?.requestId || crypto.randomUUID();
    const correlationId = request.headers['X-Correlation-Id'] || request.headers['x-correlation-id'] || crypto.randomUUID();
    const traceId = request.headers['X-Trace-Id'] || request.headers['x-trace-id'] || crypto.randomUUID();
    
    const abortController = new AbortController();
    const abortSignal = overrideContext?.abortSignal || abortController.signal;

    const context: APIContext = Object.freeze({
      requestId,
      correlationId,
      traceId,
      startTime,
      abortSignal,
      tenantContext: overrideContext?.tenantContext,
      authContext: overrideContext?.authContext
    });

    if (!featureFlags.API_RUNTIME) {
      return {
        status: 200,
        payload: { message: "API Gateway Runtime is disabled by feature flags." }
      };
    }

    const matchedRoute = this.routeRegistry.match(method, path);
    if (!matchedRoute) {
      return this.errorResponse(404, 'NOT_FOUND', `Route not found: ${method} ${path}`, correlationId);
    }

    const { metadata: route, params } = matchedRoute;
    request.params = params;

    // Idempotency check
    const idempotencyKey = request.headers['Idempotency-Key'] || request.headers['idempotency-key'];
    if (idempotencyKey) {
      const state = this.idempotencyCache.get(idempotencyKey);
      if (state === 'IN_PROGRESS') {
        return this.errorResponse(409, 'CONFLICT', 'Request is already in progress.', correlationId);
      }
      if (state) {
        return state;
      }
      this.idempotencyCache.set(idempotencyKey, 'IN_PROGRESS');
    }

    let finalResponse: APIResponse;

    try {
      if (abortSignal.aborted) {
        throw new APIException(499, 'CANCELLED', 'Request was cancelled.');
      }

      // Validation check
      if (route.validationSchema) {
        this.validate(request, route.validationSchema);
      }

      // Collect priority sorted middlewares
      const middlewares = this.middlewareRegistry.getMiddlewares();

      const runMiddleware = async (index: number): Promise<APIResponse> => {
        if (abortSignal.aborted) {
          throw new APIException(499, 'CANCELLED', 'Request was cancelled.');
        }

        if (index < middlewares.length) {
          const nextMiddleware = middlewares[index];
          return nextMiddleware(request, context, () => runMiddleware(index + 1));
        }

        return route.handler(request, context);
      };

      finalResponse = await runMiddleware(0);

    } catch (err: any) {
      let status = 500;
      let code: APIErrorCode = 'INTERNAL_ERROR';
      let message = err.message || 'Internal Server Error';
      let details = err.details || undefined;

      if (err instanceof APIException) {
        status = err.status;
        code = err.code;
      } else if (err.name === 'AbortError' || abortSignal.aborted) {
        status = 499;
        code = 'CANCELLED';
        message = 'Request was cancelled.';
      }

      finalResponse = this.errorResponse(status, code, message, correlationId, details);
    }

    // Save final response in Idempotency cache if applicable
    if (idempotencyKey) {
      this.idempotencyCache.set(idempotencyKey, finalResponse);
    }

    const latencyMs = Date.now() - startTime;
    this.metrics.push({
      requestId,
      latencyMs,
      status: finalResponse.status,
      errorCode: finalResponse.error?.code,
      cancelled: finalResponse.status === 499
    });

    return finalResponse;
  }

  private errorResponse(
    status: number,
    code: APIErrorCode,
    message: string,
    correlationId: string,
    details?: any
  ): APIResponse {
    return {
      status,
      error: {
        code,
        message,
        details,
        correlationId
      }
    };
  }

  private validate(request: APIRequest, schema: any): void {
    if (schema.params) {
      for (const [key, rulesVal] of Object.entries(schema.params)) {
        const rules = rulesVal as any;
        const val = request.params[key];
        if (rules.required && val === undefined) {
          throw new APIException(400, 'VALIDATION_ERROR', `Parameter "${key}" is required.`);
        }
        if (val !== undefined && rules.type === 'number' && isNaN(Number(val))) {
          throw new APIException(400, 'VALIDATION_ERROR', `Parameter "${key}" must be a number.`);
        }
      }
    }

    if (schema.query) {
      for (const [key, rulesVal] of Object.entries(schema.query)) {
        const rules = rulesVal as any;
        const val = request.query[key];
        if (rules.required && val === undefined) {
          throw new APIException(400, 'VALIDATION_ERROR', `Query parameter "${key}" is required.`);
        }
        if (val !== undefined && rules.type === 'number' && isNaN(Number(val))) {
          throw new APIException(400, 'VALIDATION_ERROR', `Query parameter "${key}" must be a number.`);
        }
      }
    }

    if (schema.headers) {
      for (const [key, rulesVal] of Object.entries(schema.headers)) {
        const rules = rulesVal as any;
        const val = request.headers[key];
        if (rules.required && val === undefined) {
          throw new APIException(400, 'VALIDATION_ERROR', `Header "${key}" is required.`);
        }
      }
    }

    if (schema.body) {
      if (!request.body || typeof request.body !== 'object') {
        throw new APIException(400, 'VALIDATION_ERROR', 'Request body must be a valid JSON object.');
      }
      for (const [key, rulesVal] of Object.entries(schema.body)) {
        const rules = rulesVal as any;
        const val = request.body[key];
        if (rules.required && val === undefined) {
          throw new APIException(400, 'VALIDATION_ERROR', `Body property "${key}" is required.`);
        }
        if (val !== undefined) {
          if (rules.type === 'array' && !Array.isArray(val)) {
            throw new APIException(400, 'VALIDATION_ERROR', `Body property "${key}" must be an array.`);
          } else if (rules.type !== 'array' && typeof val !== rules.type) {
            throw new APIException(400, 'VALIDATION_ERROR', `Body property "${key}" must be of type ${rules.type}.`);
          }
        }
      }
    }
  }

  public clearIdempotencyCache(): void {
    this.idempotencyCache.clear();
  }
}
