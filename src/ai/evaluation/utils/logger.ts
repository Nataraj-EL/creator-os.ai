import { EvaluationLogger, EvaluationContext, EvaluationResult } from '../types';

export class DefaultEvaluationLogger implements EvaluationLogger {
  private formatMessage(level: string, message: string, payload?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    const payloadStr = payload ? ` | Payload: ${JSON.stringify(payload)}` : '';
    return `[${timestamp}] [AI-EVAL] [${level}] ${message}${payloadStr}`;
  }

  public logStarted(context: EvaluationContext): void {
    console.info(
      this.formatMessage('STARTED', `Starting evaluation stage: ${context.stage}`, {
        requestId: context.requestId,
        creatorId: context.creatorId,
        provider: context.provider,
        model: context.model,
      })
    );
  }

  public logCompleted(result: EvaluationResult): void {
    console.info(
      this.formatMessage('COMPLETED', `Completed evaluation: ${result.evaluationId}`, {
        requestId: result.context.requestId,
        overallScore: result.overallScore,
        status: result.status,
        metricsCount: result.metrics.length,
        latencyMs: result.latencyMs,
      })
    );
  }

  public logFailed(context: EvaluationContext, error: Error, latencyMs: number): void {
    console.error(
      this.formatMessage('FAILED', `Evaluation failed: ${error.message}`, {
        requestId: context.requestId,
        stage: context.stage,
        errorName: error.name,
        latencyMs,
      })
    );
  }

  public logWarning(message: string, context?: Record<string, any>): void {
    console.warn(this.formatMessage('WARN', message, context));
  }

  public logInfo(message: string, context?: Record<string, any>): void {
    console.info(this.formatMessage('INFO', message, context));
  }
}
