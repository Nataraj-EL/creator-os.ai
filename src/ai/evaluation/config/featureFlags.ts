export interface EvaluationFeatureFlags {
  EVAL_ENABLED: boolean;
  GENERATION_EVAL: boolean;
  MEMORY_EVAL: boolean;
  CONTEXT_EVAL: boolean;
  PROMPT_EVAL: boolean;
}

export const featureFlags: EvaluationFeatureFlags = {
  EVAL_ENABLED: false,
  GENERATION_EVAL: false,
  MEMORY_EVAL: false,
  CONTEXT_EVAL: false,
  PROMPT_EVAL: false,
};
