import { 
  AIMiddleware, 
  AIRequest, 
  AIResponse, 
  AIContext, 
  MiddlewareMetadata 
} from '../types';
import { featureFlags } from '../../evaluation/config/featureFlags';
import { evaluationRunner, experimentAnalyticsService } from '../../evaluation/runtime';

export class EvaluationRuntimeMiddleware implements AIMiddleware {
  public metadata: MiddlewareMetadata = {
    name: 'EvaluationRuntimeMiddleware',
    version: '1.0.0',
    description: 'Runs dynamic heuristic evaluation suites fail-open after generation.'
  };
  public priority = 15; // Execute downstream after content generation completes

  public async before(context: AIContext, request: AIRequest): Promise<void> {
    // No-op
  }

  public async after(context: AIContext, request: AIRequest, response: AIResponse): Promise<void> {
    if (!featureFlags.EVALUATION_RUNTIME || !featureFlags.AUTO_EVALUATION) {
      return;
    }

    // Fail-open executor
    try {
      const content = (response as any).data?.scriptDraft || (response as any).data?.generatedContent || response.content || '';
      const traceId = context.traceId || '';
      const requestId = context.requestId || '';
      const variantId = context.metadata?.variantId;
      const prompt = (request as any).topic || '';
      const blocks = context.metadata?.contextBlocks || [];

      const suiteResult = await evaluationRunner.runSuite(content, {
        traceId,
        requestId,
        variantId,
        prompt,
        blocks
      });

      await experimentAnalyticsService.saveSuiteResult(suiteResult);
      
      console.log(`[AI-EVALUATION-RUNTIME] Executed suite ${suiteResult.suiteId}. Overall score: ${suiteResult.overallScore}%`);
    } catch (err: any) {
      console.error("[AI-EVALUATION-RUNTIME] Fail-open runtime middleware crashed:", err);
    }
  }

  public async onError(context: AIContext, request: AIRequest, error: Error): Promise<void> {
    // No-op
  }
}
