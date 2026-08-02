import { 
  AIMiddleware, 
  AIRequest, 
  AIResponse, 
  AIContext, 
  MiddlewareAction, 
  MiddlewareMetadata 
} from '../types';
import { EvaluationService } from '../../evaluation/types';
import { traceEventBus } from '../../observability';

// 1. Trace Middleware
export class TraceMiddleware implements AIMiddleware {
  public metadata: MiddlewareMetadata = {
    name: 'TraceMiddleware',
    version: '1.0.0',
    description: 'Ensures execution contexts have unique request and trace identifiers.'
  };
  public priority = 100; // Run early in before

  public before(context: AIContext, request: AIRequest): void {
    if (!context.requestId) {
      context.requestId = `req-mw-${Math.random().toString(36).substring(2, 9)}`;
    }
    if (!context.traceId) {
      context.traceId = `trace-mw-${Math.random().toString(36).substring(2, 9)}`;
    }

    traceEventBus.publish({
      traceId: context.traceId,
      requestId: context.requestId,
      stage: 'middleware',
      component: 'TraceMiddleware',
      status: 'started',
      metadata: { model: request.model, provider: request.provider }
    });
  }

  public after(context: AIContext, request: AIRequest, response: AIResponse): void {
    traceEventBus.publish({
      traceId: context.traceId || '',
      requestId: context.requestId || '',
      stage: 'middleware',
      component: 'TraceMiddleware',
      status: 'completed',
      metadata: {}
    });
  }

  public onError(context: AIContext, request: AIRequest, error: Error): void {
    traceEventBus.publish({
      traceId: context.traceId || '',
      requestId: context.requestId || '',
      stage: 'middleware',
      component: 'TraceMiddleware',
      status: 'failed',
      metadata: { error: error.message }
    });
  }
}

// 2. Timing Middleware
export class TimingMiddleware implements AIMiddleware {
  public metadata: MiddlewareMetadata = {
    name: 'TimingMiddleware',
    version: '1.0.0',
    description: 'Tracks start, end timestamps and calculates execution latency.'
  };
  public priority = 90; // Run early in before

  public before(context: AIContext, request: AIRequest): void {
    if (!context.startTime) {
      context.startTime = Date.now();
    }
  }

  public finally(context: AIContext, request: AIRequest): void {
    context.endTime = Date.now();
    context.durationMs = context.endTime - context.startTime;
  }
}

// 3. Logging Middleware
export class LoggingMiddleware implements AIMiddleware {
  public metadata: MiddlewareMetadata = {
    name: 'LoggingMiddleware',
    version: '1.0.0',
    description: 'Structured logging for AI pipeline events.'
  };
  public priority = 80;

  private log(level: 'INFO' | 'WARN' | 'ERROR', message: string, payload?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [AI-MW] [${level}] ${message} ${payload ? JSON.stringify(payload) : ''}`);
  }

  public before(context: AIContext, request: AIRequest): void {
    this.log('INFO', `Dispatched AI pipeline request for model ${request.model}`, {
      requestId: context.requestId,
      traceId: context.traceId,
      pipeline: context.pipeline,
      provider: request.provider
    });
  }

  public after(context: AIContext, request: AIRequest, response: AIResponse): void {
    this.log('INFO', `Successfully completed AI pipeline request`, {
      requestId: context.requestId,
      traceId: context.traceId,
      durationMs: context.durationMs
    });
  }

  public onError(context: AIContext, request: AIRequest, error: Error): void {
    this.log('ERROR', `Pipeline execution error: ${error.message}`, {
      requestId: context.requestId,
      traceId: context.traceId,
      errorName: error.name
    });
  }
}

// 4. Evaluation Middleware
export class EvaluationMiddleware implements AIMiddleware {
  public metadata: MiddlewareMetadata = {
    name: 'EvaluationMiddleware',
    version: '1.0.0',
    description: 'Orchestrates real-time LLM quality audits via the AI Evaluation service.'
  };
  public priority = 10; // Run late (after content generation completes)

  private evaluationService: EvaluationService;

  constructor(evaluationService: EvaluationService) {
    this.evaluationService = evaluationService;
  }

  public async after(context: AIContext, request: AIRequest, response: AIResponse): Promise<void> {
    try {
      const evalContext = {
        requestId: context.requestId,
        creatorId: context.creatorId,
        sessionId: context.traceId, // Map trace ID as sessionId in evaluation metrics
        stage: context.stage as any, // stage defaults to EvaluationStage matching
        provider: request.provider,
        model: request.model,
        metadata: {
          inputPrompt: request.prompt,
          generatedContent: response.content,
          ...context.metadata
        }
      };

      // Run evaluation asynchronously without blocking client thread response
      this.evaluationService.evaluate(evalContext).catch(err => {
        console.error("[AI-MW] Asynchronous evaluation trigger failed:", err);
      });

    } catch (e) {
      console.error("[AI-MW] Failed to prepare evaluation parameters:", e);
    }
  }
}

export * from './memoryLearningMiddleware';
export * from './evaluationRuntimeMiddleware';
