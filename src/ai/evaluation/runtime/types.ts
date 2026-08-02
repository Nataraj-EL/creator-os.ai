export interface EvaluatorResult {
  name: string;
  score: number; // 0 to 100
  reason: string;
  metadata: Record<string, any>;
}

export interface Evaluator {
  name: string;
  evaluate(content: string, context?: any): Promise<EvaluatorResult>;
}

export interface EvaluationWeights {
  relevance: number;
  contextUsage: number;
  grounding: number;
  responseQuality: number;
}

export interface EvaluationSuiteResult {
  suiteId: string;
  traceId: string;
  requestId: string;
  variantId?: string; // Associated prompt/template variant ID
  overallScore: number;
  status: 'completed' | 'failed';
  results: Record<string, EvaluatorResult>; // Map of evaluator name -> result
  metadata: Record<string, any>;
  createdAt: string;
}

export interface ExperimentVariant {
  variantId: string;
  name: string;
  promptTemplate: string;
  weight?: number; // relative weight for weighted selection
}

export interface Experiment {
  experimentId: string;
  name: string;
  variants: ExperimentVariant[];
  selectionStrategy: 'fixed' | 'random' | 'weighted';
  activeVariantId?: string; // Used for fixed strategy selection
}

export interface ExperimentAssignment {
  experimentId: string;
  variantId: string;
  strategy: string;
  traceId: string;
  timestamp: string;
}

export interface VariantPerformance {
  variantId: string;
  variantName: string;
  assignmentCount: number;
  avgRelevance: number;
  avgContextUsage: number;
  avgGrounding: number;
  avgResponseQuality: number;
  avgOverallScore: number;
}

export interface ExperimentAnalytics {
  experimentId: string;
  experimentName: string;
  totalAssignments: number;
  variants: VariantPerformance[];
  leaderVariantId?: string;
}
