import { AIMiddleware, AIContext, AIRequest, AIResponse, MiddlewareAction } from '../../middleware/types';
import { cacheService } from '../services';
import { buildCacheKey } from '../utils/key';
import { featureFlags } from '../config/featureFlags';
import { policyRuntime, featureFlags as policyFeatureFlags } from '../../policy';

export class CachingMiddleware implements AIMiddleware {
  public metadata = {
    name: 'CachingMiddleware',
    version: '1.0.0',
    description: 'Distributed cache for prompt generation with memory fallback.'
  };

  public priority = 75; // Run after Trace/Timing/Logging but before generation

  private static inFlight = new Map<string, Promise<any>>();

  public async before(context: AIContext, request: AIRequest): Promise<MiddlewareAction | void> {
    if (!featureFlags.CACHE_ENABLED) {
      return;
    }

    // 1. Determine eligibility
    const cacheOpt = request.options?.cache;
    const isExplicitBypass = cacheOpt === false || request.options?.bypassCache === true || request.options?.cacheControl?.bypass === true;
    if (isExplicitBypass) {
      return;
    }

    const isExplicitCacheable = cacheOpt === true || request.options?.cacheControl?.cacheable === true;
    const isDeterministic = request.options?.temperature === 0 || request.options?.temperature === undefined;

    if (!isExplicitCacheable && !isDeterministic) {
      return; // Reject non-deterministic unless explicitly marked cacheable
    }

    // Only cache generation pipeline
    if (context.pipeline !== 'generation') {
      return;
    }

    const isInvalidate = request.options?.cacheControl?.invalidate === true || request.options?.invalidateCache === true;

    // 2. Generate cache key
    let key: string;
    try {
      key = buildCacheKey(
        {
          tenantId: context.metadata.tenantId,
          workspaceId: context.metadata.workspaceId || (request as any).workspaceId,
          creatorId: context.creatorId
        },
        request,
        context.metadata.promptVersion
      );
    } catch (err: any) {
      console.warn('[AICache] Cache key construction failed (fail-open):', err.message);
      return;
    }

    const cacheOptions = {
      ttlSeconds: request.options?.cacheControl?.ttlSeconds,
      traceId: context.traceId,
      requestId: context.requestId,
      tenantId: context.metadata.tenantId,
      workspaceId: context.metadata.workspaceId || (request as any).workspaceId
    };

    context.metadata.cacheKey = key;
    context.metadata.cacheOptions = cacheOptions;

    // 3. Handle Invalidation
    if (isInvalidate) {
      await cacheService.delete(key, cacheOptions).catch(() => {});
    }

    // 4. Concurrency - Single Flight check
    if (CachingMiddleware.inFlight.has(key)) {
      try {
        const response = await CachingMiddleware.inFlight.get(key);
        if (response) {
          context.metadata.response = response;
          context.metadata.cacheHit = true;
          context.metadata.evaluationCompleted = true; // avoid duplicate evaluation
          return MiddlewareAction.STOP;
        }
      } catch (err) {
        // Fall-open if the concurrent generation failed
      }
    }

    // 5. Query cache
    const cached = await cacheService.get<AIResponse>(key, cacheOptions);
    if (cached) {
      // Run PolicyRuntime checks on cache hit to verify content compliance
      if (policyFeatureFlags.POLICY_RUNTIME && policyFeatureFlags.OUTPUT_GUARDRAILS) {
        try {
          const report = await policyRuntime.evaluate('POST_PROVIDER', cached.content, {
            requestId: context.requestId,
            traceId: context.traceId,
            creatorId: context.creatorId,
            provider: request.provider,
            model: request.model,
            metadata: context.metadata
          });
          cached.content = report.finalContent;
          if (cached.metadata) {
            if ((cached as any).data) {
              const data = (cached as any).data;
              if (data.scriptDraft !== undefined) data.scriptDraft = report.finalContent;
              if (data.generatedContent !== undefined) data.generatedContent = report.finalContent;
              if (data.content !== undefined) data.content = report.finalContent;
            }
          }
        } catch (err: any) {
          if (err.name === 'PolicyError') {
            await cacheService.delete(key, cacheOptions).catch(() => {});
            throw err;
          }
          console.error('[AICache] Post-provider policy evaluate failed on cache hit (fail-open):', err.message);
        }
      }

      context.metadata.response = cached;
      context.metadata.cacheHit = true;
      context.metadata.evaluationCompleted = true;
      return MiddlewareAction.STOP;
    }

    // 6. Set up Single Flight promise for cache miss
    let resolvePromise: (val: any) => void = () => {};
    let rejectPromise: (err: any) => void = () => {};
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    // Attach dummy catch handler to prevent unhandled rejection warnings
    promise.catch(() => {});

    CachingMiddleware.inFlight.set(key, promise);
    context.metadata.resolvePromise = resolvePromise;
    context.metadata.rejectPromise = rejectPromise;
  }

  public async after(context: AIContext, request: AIRequest, response: AIResponse): Promise<void> {
    const key = context.metadata.cacheKey;
    const cacheOptions = context.metadata.cacheOptions;

    // Resolve in-flight promise if this was the fetcher request
    const resolvePromise = context.metadata.resolvePromise;
    if (resolvePromise) {
      resolvePromise(response);
      if (key) CachingMiddleware.inFlight.delete(key);
    }

    if (context.metadata.cacheHit) {
      return; // No need to write back on cache hits
    }

    if (!key || !featureFlags.CACHE_ENABLED) {
      return;
    }

    // Verify response content is successful, valid and non-empty
    if (!response.content || !response.content.trim()) {
      return;
    }

    // Do not cache policy blocks or evaluator failures
    if (context.metadata.policyBlocked === true) {
      return;
    }

    await cacheService.set(key, response, cacheOptions).catch(() => {});
  }

  public async onError(context: AIContext, request: AIRequest, error: Error): Promise<void> {
    const key = context.metadata.cacheKey;
    const rejectPromise = context.metadata.rejectPromise;

    if (rejectPromise) {
      rejectPromise(error);
      if (key) CachingMiddleware.inFlight.delete(key);
    }
  }

  public async finally(context: AIContext, request: AIRequest): Promise<void> {
    const key = context.metadata.cacheKey;
    if (key && CachingMiddleware.inFlight.has(key)) {
      const rejectPromise = context.metadata.rejectPromise;
      if (rejectPromise) {
        rejectPromise(new Error('Generation cancelled or timed out.'));
      }
      CachingMiddleware.inFlight.delete(key);
    }
  }
}
