export interface APIContext {
  readonly requestId: string;
  readonly correlationId: string;
  readonly traceId: string;
  readonly tenantContext?: any;
  readonly authContext?: { userId: string; scopes: string[] };
  readonly abortSignal: AbortSignal;
  readonly startTime: number;
}

export interface APIRequest {
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  body: any;
}

export type APIErrorCode = 
  | 'VALIDATION_ERROR' 
  | 'UNAUTHORIZED' 
  | 'FORBIDDEN' 
  | 'NOT_FOUND' 
  | 'CONFLICT' 
  | 'RATE_LIMITED' 
  | 'CANCELLED' 
  | 'TIMEOUT' 
  | 'PROVIDER_ERROR' 
  | 'INTERNAL_ERROR';

export interface APIError {
  code: APIErrorCode;
  message: string;
  details?: any;
  correlationId?: string;
}

export interface APIResponse {
  status: number;
  payload?: any;
  headers?: Record<string, string>;
  error?: APIError;
}

export type RouteHandler = (request: APIRequest, context: APIContext) => Promise<APIResponse>;

export interface RouteMetadata {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: RouteHandler;
  tags?: string[];
  summary?: string;
  description?: string;
  validationSchema?: {
    params?: Record<string, { type: 'string' | 'number'; required?: boolean }>;
    query?: Record<string, { type: 'string' | 'number'; required?: boolean }>;
    headers?: Record<string, { type: 'string'; required?: boolean }>;
    body?: Record<string, { type: 'string' | 'number' | 'boolean' | 'object' | 'array'; required?: boolean }>;
  };
  security?: Array<Record<string, string[]>>;
}

export type Middleware = (
  request: APIRequest, 
  context: APIContext, 
  next: () => Promise<APIResponse>
) => Promise<APIResponse>;

export interface ResponseSerializer {
  serializeJSON(response: APIResponse): string;
  serializeSSE(event: string, data: any, id?: string): string;
}

export interface RateLimiter {
  limit(
    key: string, 
    limit: number, 
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }>;
}

export class APIException extends Error {
  constructor(
    public readonly status: number,
    public readonly code: APIErrorCode,
    message: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'APIException';
  }
}
