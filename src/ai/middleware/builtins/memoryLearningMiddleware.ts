import { 
  AIMiddleware, 
  AIRequest, 
  AIResponse, 
  AIContext, 
  MiddlewareMetadata 
} from '../types';
import { 
  MemoryLearningService, 
  DefaultMemoryLearningService, 
  MemoryExtractor, 
  DefaultMemoryDecisionEngine, 
  ImportancePolicy, 
  DuplicatePolicy, 
  FreshnessPolicy, 
  extractionFeatureFlags 
} from '../../memory/extraction';
import { MemoryRuntime } from '../../memory/services';
import { memoryProviderRegistry } from '../../memory/providers';
import { MemoryRepositoryFactory } from '../../memory/storage/repositoryFactory';

export class MemoryLearningMiddleware implements AIMiddleware {
  public metadata: MiddlewareMetadata = {
    name: 'MemoryLearningMiddleware',
    version: '1.0.0',
    description: 'Triggers automatic long-term memory extraction and learning from completed generations.'
  };
  public priority = 20; // Run late in after (before evaluation runs at priority 10)

  private learningService?: MemoryLearningService;

  constructor(learningService?: MemoryLearningService) {
    this.learningService = learningService;
  }

  private getLearningService(): MemoryLearningService {
    if (!this.learningService) {
      const repo = MemoryRepositoryFactory.getRepository();
      const runtime = new MemoryRuntime(memoryProviderRegistry, repo);
      const extractor = new MemoryExtractor(runtime, new DefaultMemoryDecisionEngine(), [
        new ImportancePolicy(),
        new DuplicatePolicy(runtime),
        new FreshnessPolicy()
      ]);
      this.learningService = new DefaultMemoryLearningService(extractor);
    }
    return this.learningService;
  }

  public async after(context: AIContext, request: AIRequest, response: AIResponse): Promise<void> {
    if (!extractionFeatureFlags.AUTO_MEMORY_LEARNING) {
      return;
    }

    try {
      const service = this.getLearningService();
      
      const memoryContext = {
        userId: context.creatorId,
        requestId: context.requestId,
        sessionId: context.traceId,
        metadata: context.metadata
      };

      // Call learn asynchronously (fire-and-forget: service handles background dispatching)
      service.learn(
        memoryContext,
        request.prompt,
        response.content,
        context.metadata
      ).catch(err => {
        console.error("[AI-MW] Asynchronous auto memory learning execution failed:", err);
      });
      
    } catch (e) {
      console.error("[AI-MW] Fail-open: Failed to trigger memory learning pipeline:", e);
    }
  }
}
