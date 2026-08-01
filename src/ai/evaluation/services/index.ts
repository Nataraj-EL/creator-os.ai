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

export class DefaultEvaluationService implements IEvaluationService {
  private registry = evaluationRegistry;
  private logger: EvaluationLogger;
  private repository?: EvaluationRepository;

  constructor(logger?: EvaluationLogger, repository?: EvaluationRepository) {
    this.logger = logger || new DefaultEvaluationLogger();
    this.repository = repository;
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
      
      const enrichedResult: EvaluationResult = {
        ...result,
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

      return failedResult;
    }
  }
}

export const evaluationService = new DefaultEvaluationService();
