export interface EvaluationFeatureFlags {
  EVAL_ENABLED: boolean;
  GENERATION_EVAL: boolean;
  MEMORY_EVAL: boolean;
  CONTEXT_EVAL: boolean;
  PROMPT_EVAL: boolean;
  EVALUATION_RUNTIME: boolean;
  AUTO_EVALUATION: boolean;
  EXPERIMENTS_ENABLED: boolean;
}

export const featureFlags: EvaluationFeatureFlags = {
  EVAL_ENABLED: false,
  GENERATION_EVAL: false,
  MEMORY_EVAL: false,
  CONTEXT_EVAL: false,
  PROMPT_EVAL: false,
  EVALUATION_RUNTIME: false,
  AUTO_EVALUATION: false,
  EXPERIMENTS_ENABLED: false,
};
