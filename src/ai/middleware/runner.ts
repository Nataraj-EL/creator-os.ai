import { 
  AIRequest, 
  AIResponse, 
  AIContext, 
  AIMiddleware, 
  MiddlewareAction, 
  AIHandler 
} from './types';

export class AIMiddlewareRunner {
  private middlewares: AIMiddleware[] = [];

  public use(middleware: AIMiddleware): void {
    this.middlewares.push(middleware);
    // Sort descending by priority: higher number runs first
    this.middlewares.sort((a, b) => b.priority - a.priority);
  }

  public getMiddlewares(): AIMiddleware[] {
    return [...this.middlewares];
  }

  public async run<TReq extends AIRequest, TRes extends AIResponse>(
    context: Omit<AIContext, 'requestId' | 'traceId' | 'startTime' | 'endTime' | 'durationMs'>,
    request: TReq,
    handler: AIHandler<TReq, TRes>
  ): Promise<TRes> {
    // Resolve context identifiers
    const requestId = context.metadata?.requestId || `req-mw-${Math.random().toString(36).substring(2, 9)}`;
    const traceId = context.metadata?.traceId || `trace-mw-${Math.random().toString(36).substring(2, 9)}`;

    const fullContext: AIContext = {
      ...context,
      requestId,
      traceId,
      startTime: Date.now(),
      metadata: context.metadata || {}
    };

    let shortCircuited = false;
    let response: TRes | null = null;

    try {
      // 1. Execute 'before' hooks
      for (const middleware of this.middlewares) {
        if (middleware.before) {
          const action = await middleware.before(fullContext, request);
          if (action === MiddlewareAction.STOP) {
            shortCircuited = true;
            break;
          }
        }
      }

      // 2. Execute target handler or load short-circuit response
      if (!shortCircuited) {
        response = await handler.handle(fullContext, request);
      } else {
        response = (fullContext.metadata.response as TRes) || ({
          content: 'Execution stopped by middleware short-circuit.',
          metadata: { shortCircuited: true }
        } as unknown as TRes);
      }

      fullContext.endTime = Date.now();
      fullContext.durationMs = fullContext.endTime - fullContext.startTime;

      // 3. Execute 'after' hooks
      for (const middleware of this.middlewares) {
        if (middleware.after) {
          await middleware.after(fullContext, request, response!);
        }
      }

      return response!;

    } catch (err: any) {
      fullContext.endTime = Date.now();
      fullContext.durationMs = fullContext.endTime - fullContext.startTime;

      // 4. Execute 'onError' hooks
      for (const middleware of this.middlewares) {
        if (middleware.onError) {
          try {
            await middleware.onError(fullContext, request, err);
          } catch (e: any) {
            console.error(`Middleware [${middleware.metadata.name}] onError hook threw:`, e);
          }
        }
      }

      throw err;

    } finally {
      // 5. Execute 'finally' hooks
      for (const middleware of this.middlewares) {
        if (middleware.finally) {
          try {
            await middleware.finally(fullContext, request);
          } catch (e: any) {
            console.error(`Middleware [${middleware.metadata.name}] finally hook threw:`, e);
          }
        }
      }
    }
  }
}
export const aiMiddlewareRunner = new AIMiddlewareRunner();
