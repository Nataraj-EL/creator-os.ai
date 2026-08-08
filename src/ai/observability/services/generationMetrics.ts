import { traceEventBus } from './traceRuntime';
import { TraceEvent } from '../types';

export interface ModelPricing {
  promptPricePer1K: number;
  completionPricePer1K: number;
}

export const defaultModelPricing: Record<string, ModelPricing> = {
  'gpt-4': { promptPricePer1K: 0.03, completionPricePer1K: 0.06 },
  'gpt-3.5-turbo': { promptPricePer1K: 0.0015, completionPricePer1K: 0.002 },
  'claude-3-opus': { promptPricePer1K: 0.015, completionPricePer1K: 0.075 },
  'claude-3-sonnet': { promptPricePer1K: 0.003, completionPricePer1K: 0.015 },
  'gemini-1.5-pro': { promptPricePer1K: 0.007, completionPricePer1K: 0.021 }
};

export class GenerationMetricsCollector {
  private totalCount = 0;
  private successCount = 0;
  private failureCount = 0;
  private totalTokens = 0;
  private totalCost = 0;

  private totalLatencySum = 0;
  private providerLatencySum = 0;
  private memoryLatencySum = 0;
  private evaluationLatencySum = 0;

  private latencyCounts: Record<string, number> = {
    total: 0,
    provider: 0,
    memory: 0,
    evaluation: 0
  };

  private activeStartTimes: Map<string, number> = new Map();
  private modelPricingMap: Record<string, ModelPricing> = { ...defaultModelPricing };
  private unsubscribe?: () => void;

  constructor() {
    this.unsubscribe = traceEventBus.subscribe((event) => this.processEvent(event));
  }

  public setPricing(model: string, pricing: ModelPricing): void {
    this.modelPricingMap[model.toLowerCase()] = pricing;
  }

  public getSummary() {
    return {
      totalCount: this.totalCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      avgLatencyMs: this.getAverage('total', this.totalLatencySum),
      avgProviderLatencyMs: this.getAverage('provider', this.providerLatencySum),
      avgMemoryLatencyMs: this.getAverage('memory', this.memoryLatencySum),
      avgEvaluationLatencyMs: this.getAverage('evaluation', this.evaluationLatencySum),
      totalTokens: this.totalTokens,
      totalCost: parseFloat(this.totalCost.toFixed(6))
    };
  }

  public clear(): void {
    this.totalCount = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.totalTokens = 0;
    this.totalCost = 0;
    this.totalLatencySum = 0;
    this.providerLatencySum = 0;
    this.memoryLatencySum = 0;
    this.evaluationLatencySum = 0;
    this.latencyCounts = { total: 0, provider: 0, memory: 0, evaluation: 0 };
    this.activeStartTimes.clear();
  }

  public dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  private getAverage(key: string, sum: number): number {
    const count = this.latencyCounts[key];
    return count > 0 ? Math.round(sum / count) : 0;
  }

  private processEvent(event: TraceEvent): void {
    try {
      const key = `${event.traceId}-${event.component}`;
      const lowerComponent = event.component.toLowerCase();

      if (event.status === 'started') {
        this.activeStartTimes.set(key, new Date(event.timestamp).getTime());
      } else if (event.status === 'completed' || event.status === 'failed') {
        const startTime = this.activeStartTimes.get(key);
        if (startTime) {
          const duration = new Date(event.timestamp).getTime() - startTime;
          this.activeStartTimes.delete(key);

          if (event.component === 'TraceMiddleware' || event.component === 'GenerationPipeline') {
            this.totalLatencySum += duration;
            this.latencyCounts.total++;
            this.totalCount++;
            if (event.status === 'completed') {
              this.successCount++;
            } else {
              this.failureCount++;
            }
          } else if (lowerComponent.includes('provider')) {
            this.providerLatencySum += duration;
            this.latencyCounts.provider++;
          } else if (lowerComponent.includes('memory') || lowerComponent.includes('retrieval')) {
            this.memoryLatencySum += duration;
            this.latencyCounts.memory++;
          } else if (lowerComponent.includes('evaluation')) {
            this.evaluationLatencySum += duration;
            this.latencyCounts.evaluation++;
          }
        }

        if (event.status === 'completed' && event.metadata) {
          const usage = event.metadata.usage || {};
          const model = event.metadata.model || 'gpt-3.5-turbo';
          const promptTokens = usage.promptTokens || event.metadata.tokenCount || 0;
          const completionTokens = usage.completionTokens || 0;
          const tokens = promptTokens + completionTokens;

          if (tokens > 0) {
            this.totalTokens += tokens;
            const pricing = this.modelPricingMap[model.toLowerCase()] || this.modelPricingMap['gpt-3.5-turbo'];
            const cost = (promptTokens / 1000 * pricing.promptPricePer1K) + (completionTokens / 1000 * pricing.completionPricePer1K);
            this.totalCost += cost;
          }
        }
      }
    } catch (err) {
      // Fail-open
    }
  }
}

export const generationMetrics = new GenerationMetricsCollector();
