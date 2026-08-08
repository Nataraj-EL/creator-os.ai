import { 
  EvaluationService as IEvaluationService,
  EvaluationContext, 
  EvaluationResult, 
  EvaluationConfig, 
  EvaluationStatus,
  EvaluationLogger,
  EvaluationRepository,
  EvaluationStage
} from '../types';
import { featureFlags } from '../config/featureFlags';
import { evaluationRegistry } from '../providers';
import { DefaultEvaluationLogger } from '../utils/logger';
import { ProviderError } from '../utils/errors';
import { EvaluationRepositoryFactory } from '../storage/repositoryFactory';
import { traceEventBus } from '../../observability';
import { calculateDecision } from '../utils/decision';

export class DefaultEvaluationService implements IEvaluationService {
  private registry = evaluationRegistry;
  private logger: EvaluationLogger;
  private repository?: EvaluationRepository;

  constructor(logger?: EvaluationLogger, repository?: EvaluationRepository) {
    this.logger = logger || new DefaultEvaluationLogger();
    this.repository = repository || EvaluationRepositoryFactory.getRepository();
  }

  private isStageEnabled(stage: EvaluationStage): boolean {
    if (!featureFlags.EVAL_ENABLED) return false;

    switch (stage) {
      case EvaluationStage.GENERATION:
        return featureFlags.GENERATION_EVAL;
      case EvaluationStage.MEMORY:
        return featureFlags.MEMORY_EVAL;
      case EvaluationStage.CONTEXT:
        return featureFlags.CONTEXT_EVAL;
      case EvaluationStage.PROMPT:
        return featureFlags.PROMPT_EVAL;
      default:
        return true; // Other stages default to master toggle check only
    }
  }

  public async evaluate(context: EvaluationContext, config?: EvaluationConfig): Promise<EvaluationResult> {
    const startTime = Date.now();

    traceEventBus.publish({
      traceId: context.sessionId || '',
      requestId: context.requestId || '',
      stage: 'evaluation',
      component: 'EvaluationService',
      status: 'started',
      metadata: { stage: context.stage, provider: context.provider }
    });

    // Check if stage is enabled
    if (!this.isStageEnabled(context.stage)) {
      const skippedResult: EvaluationResult = {
        evaluationId: `eval-skip-${Math.random().toString(36).substring(2, 9)}`,
        context,
        status: EvaluationStatus.SKIPPED,
        metrics: [],
        overallScore: 0,
        latencyMs: 0,
        createdAt: new Date().toISOString()
      };
      
      this.logger.logInfo(`Evaluation skipped for stage: ${context.stage} (Feature flags disabled).`);
      return skippedResult;
    }

    this.logger.logStarted(context);

    try {
      // Resolve provider
      const providerName = config?.providerName || context.provider || 'LLM-Judge';
      const provider = this.registry.get(providerName);

      // Validate provider support
      if (!provider.metadata.supportedStages.includes(context.stage)) {
        throw new ProviderError(
          providerName, 
          `Provider does not support evaluation for stage: ${context.stage}`
        );
      }

      // Execute evaluation
      const result = await provider.execute(context, config);
      const latencyMs = Date.now() - startTime;
      
      const relevanceVal = result.metrics.find(m => m.metricId === 'relevance')?.score;
      const groundingVal = result.metrics.find(m => m.metricId === 'grounding' || m.metricId === 'faithfulness')?.score;
      const responseQualityVal = result.metrics.find(m => m.metricId === 'responseQuality')?.score;
      const contextUsageVal = result.metrics.find(m => m.metricId === 'contextUsage')?.score;
      const llmJudgeVal = result.overallScore;

      const scores: any = {};
      const expected: any[] = [];

      if (relevanceVal !== undefined) {
        scores.relevance = relevanceVal;
        expected.push('relevance');
      }
      if (groundingVal !== undefined) {
        scores.grounding = groundingVal;
        expected.push('grounding');
      }
      if (responseQualityVal !== undefined) {
        scores.responseQuality = responseQualityVal;
        expected.push('responseQuality');
      }
      if (contextUsageVal !== undefined) {
        scores.contextUsage = contextUsageVal;
        expected.push('contextUsage');
      }
      if (llmJudgeVal !== undefined) {
        scores.llmJudge = llmJudgeVal;
        expected.push('llmJudge');
      }

      const customThresh: any = {};
      if (config?.thresholds) {
        for (const [k, v] of Object.entries(config.thresholds)) {
          customThresh[k] = { fail: v, warn: (config.thresholds as any)[k + '_warn'] ?? (v + 20) };
        }
      }

      const decision = calculateDecision(scores, expected, customThresh);

      const enrichedResult: EvaluationResult = {
        ...result,
        decision,
        latencyMs
      };

      this.logger.logCompleted(enrichedResult);

      // Save to repository if configured
      if (this.repository) {
        await this.repository.save(enrichedResult).catch(err => {
          this.logger.logWarning(`Failed to persist evaluation record: ${err.message}`, {
            evaluationId: enrichedResult.evaluationId
          });
        });
      }

      traceEventBus.publish({
        traceId: context.sessionId || '',
        requestId: context.requestId || '',
        stage: 'evaluation',
        component: 'EvaluationService',
        status: 'completed',
        metadata: { 
          status: enrichedResult.status, 
          overallScore: enrichedResult.overallScore,
          decision: enrichedResult.decision,
          metrics: enrichedResult.metrics.reduce((acc, m) => {
            acc[m.metricId] = m.score;
            return acc;
          }, {} as Record<string, number>),
          provider: context.provider,
          model: context.model,
          latencyMs: enrichedResult.latencyMs
        }
      });

      return enrichedResult;

    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      this.logger.logFailed(context, err, latencyMs);

      const failedResult: EvaluationResult = {
        evaluationId: `eval-failed-${Math.random().toString(36).substring(2, 9)}`,
        context,
        status: EvaluationStatus.FAILED,
        metrics: [],
        overallScore: 0,
        latencyMs,
        errorMessage: err.message || 'Unknown evaluation execution failure.',
        createdAt: new Date().toISOString()
      };

      if (this.repository) {
        await this.repository.save(failedResult).catch(() => {});
      }

      traceEventBus.publish({
        traceId: context.sessionId || '',
        requestId: context.requestId || '',
        stage: 'evaluation',
        component: 'EvaluationService',
        status: 'failed',
        metadata: { error: err.message || 'Evaluation execution failure.' }
      });

      return failedResult;
    }
  }
}

export const evaluationService = new DefaultEvaluationService();
