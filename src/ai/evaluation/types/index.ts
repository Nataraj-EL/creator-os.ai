export enum EvaluationStage {
  GENERATION = 'GENERATION',
  RETRIEVAL = 'RETRIEVAL',
  MEMORY = 'MEMORY',
  CONTEXT = 'CONTEXT',
  PROMPT = 'PROMPT',
  CONVERSATION = 'CONVERSATION'
}

export enum EvaluationStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED'
}

export interface EvaluationMetric {
  metricId: string;
  name: string;
  score: number; // 0 to 100 or specific numeric grade
  weight: number; // relative weight (0.0 to 1.0)
  confidence: number; // confidence score (0.0 to 1.0)
  status: 'pass' | 'fail' | 'warning';
  reason: string;
}

export interface EvaluationContext {
  requestId: string;
  creatorId: string;
  sessionId?: string;
  pipelineId?: string;
  stage: EvaluationStage;
  provider: string;
  model: string;
  promptVersion?: string;
  metadata?: Record<string, any>;
}

export interface ProviderMetadata {
  name: string;
  version: string;
  supportedStages: EvaluationStage[];
  capabilities: string[];
}

export type EvaluationDecision = 'PASS' | 'WARN' | 'FAIL';

export interface EvaluationResult {
  evaluationId: string;
  context: EvaluationContext;
  status: EvaluationStatus;
  metrics: EvaluationMetric[];
  overallScore: number;
  decision?: EvaluationDecision;
  latencyMs: number;
  errorMessage?: string;
  createdAt: string;
}

export interface EvaluationConfig {
  providerName: string;
  stage: EvaluationStage;
  metrics: string[];
  thresholds?: Record<string, number>;
}

export interface EvaluationProvider {
  metadata: ProviderMetadata;
  execute(context: EvaluationContext, config?: EvaluationConfig): Promise<EvaluationResult>;
}

export interface EvaluationRepository {
  save(result: EvaluationResult): Promise<void>;
  getById(id: string): Promise<EvaluationResult | null>;
  getByRequestId(requestId: string): Promise<EvaluationResult[]>;
}

export interface EvaluationLogger {
  logStarted(context: EvaluationContext): void;
  logCompleted(result: EvaluationResult): void;
  logFailed(context: EvaluationContext, error: Error, latencyMs: number): void;
  logWarning(message: string, context?: Record<string, any>): void;
  logInfo(message: string, context?: Record<string, any>): void;
}

export interface EvaluationService {
  evaluate(context: EvaluationContext, config?: EvaluationConfig): Promise<EvaluationResult>;
}

export interface EvaluationEvent {
  eventId: string;
  eventName: 'started' | 'completed' | 'failed' | 'warning' | 'info';
  timestamp: string;
  payload?: Record<string, any>;
}
