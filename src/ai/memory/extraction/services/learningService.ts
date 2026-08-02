import { 
  MemoryLearningService, 
  MemoryLearningDispatcher, 
  MemoryExtractionResult,
  MemoryDecision,
  LearningLifecycleEvent,
  LearningLifecycleListener,
  LearningLifecycleEventType
} from '../types';
import { MemoryExtractor } from '../extractor';
import { MemoryContext } from '../../types';
import { traceEventBus } from '../../../observability';

export class DefaultMemoryLearningDispatcher implements MemoryLearningDispatcher {
  public dispatch(task: () => Promise<void>): void {
    Promise.resolve().then(async () => {
      try {
        await task();
      } catch (e) {
        console.error("[AI-LEARN] Background dispatch task execution failed:", e);
      }
    });
  }
}

export class DefaultMemoryLearningService implements MemoryLearningService {
  private extractor: MemoryExtractor;
  private dispatcher: MemoryLearningDispatcher;
  private processedIds: Set<string> = new Set();
  private listeners: Set<LearningLifecycleListener> = new Set();

  constructor(
    extractor: MemoryExtractor,
    dispatcher?: MemoryLearningDispatcher
  ) {
    this.extractor = extractor;
    this.dispatcher = dispatcher || new DefaultMemoryLearningDispatcher();
  }

  public addListener(listener: LearningLifecycleListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: LearningLifecycleListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(
    type: LearningLifecycleEventType, 
    context: MemoryContext, 
    details: Record<string, any>
  ): void {
    const event: LearningLifecycleEvent = {
      type,
      timestamp: new Date().toISOString(),
      context,
      details
    };

    console.log(`[${event.timestamp}] [AI-LEARN] [${type}] context: ${JSON.stringify(context)}, details: ${JSON.stringify(details)}`);

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error("[AI-LEARN] Learning event listener threw error:", e);
      }
    }
  }

  public async learn(
    context: MemoryContext,
    prompt: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<MemoryExtractionResult[]> {
    const reqId = context.requestId;
    const traceId = context.sessionId;

    // Idempotency: Prevent duplicate learning for the same requestId or traceId
    if (reqId && this.processedIds.has(reqId)) {
      console.log(`[AI-LEARN] Duplicate request ID ${reqId} learning skipped (idempotent).`);
      return [];
    }
    if (traceId && this.processedIds.has(traceId)) {
      console.log(`[AI-LEARN] Duplicate trace ID ${traceId} learning skipped (idempotent).`);
      return [];
    }

    if (reqId) this.processedIds.add(reqId);
    if (traceId) this.processedIds.add(traceId);

    // Limit cache size to prevent unbounded memory growth (keep last 500 ids)
    if (this.processedIds.size > 500) {
      const it = this.processedIds.values();
      const first = it.next().value;
      if (first !== undefined) this.processedIds.delete(first);
    }

    traceEventBus.publish({
      traceId: context.sessionId || '',
      requestId: context.requestId || '',
      stage: 'memory-learning',
      component: 'MemoryLearningService',
      status: 'started',
      metadata: { promptLength: prompt.length, contentLength: content.length }
    });

    // Execute asynchronously via dispatcher (fire-and-forget background queue logic)
    const resultsPromise: Promise<MemoryExtractionResult[]> = new Promise((resolve, reject) => {
      this.dispatcher.dispatch(async () => {
        const startTime = Date.now();
        this.emitEvent('MEMORY_LEARNING_STARTED', context, { promptLength: prompt.length, contentLength: content.length });

        try {
          const mergedText = `User Prompt: ${prompt}\nGenerated Content: ${content}`;
          
          // Merge metadata trace contexts
          const runContext: MemoryContext = {
            ...context,
            metadata: {
              ...context.metadata,
              ...metadata,
              requestId: context.requestId,
              traceId: context.sessionId,
              promptVersion: metadata?.promptVersion || '1.0.0'
            }
          };

          const results = await this.extractor.extract(runContext, mergedText);
          const latency = Date.now() - startTime;

          const decisionCounts = results.reduce((acc, curr) => {
            acc[curr.decision] = (acc[curr.decision] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          const storedMemoryContents = results
            .filter(r => 
              r.decision === MemoryDecision.ACCEPT || 
              r.decision === MemoryDecision.UPDATE_EXISTING || 
              r.decision === MemoryDecision.MERGE
            )
            .map(r => r.candidate.content);

          this.emitEvent('MEMORY_LEARNING_COMPLETED', context, {
            latency,
            resultsCount: results.length,
            decisionCounts,
            storedMemoryContents
          });

          traceEventBus.publish({
            traceId: context.sessionId || '',
            requestId: context.requestId || '',
            stage: 'memory-learning',
            component: 'MemoryLearningService',
            status: 'completed',
            metadata: { resultsCount: results.length }
          });

          resolve(results);
        } catch (err: any) {
          this.emitEvent('MEMORY_LEARNING_FAILED', context, { error: err.message });
          
          traceEventBus.publish({
            traceId: context.sessionId || '',
            requestId: context.requestId || '',
            stage: 'memory-learning',
            component: 'MemoryLearningService',
            status: 'failed',
            metadata: { error: err.message }
          });

          reject(err);
        }
      });
    });

    // To preserve fire-and-forget, we return immediately to the middleware caller
    // Middleware triggers it without awaiting background dispatch
    return [];
  }
}
