export interface EvaluationFeatureFlags {
  EVAL_ENABLED: boolean;
  GENERATION_EVAL: boolean;
  MEMORY_EVAL: boolean;
  CONTEXT_EVAL: boolean;
  PROMPT_EVAL: boolean;
  EVALUATION_RUNTIME: boolean;
  AUTO_EVALUATION: boolean;
  EXPERIMENTS_ENABLED: boolean;
  STRICT_EVALUATION: boolean;
  BLOCK_ON_FAIL: boolean;
}

export const featureFlags: EvaluationFeatureFlags = {
  EVAL_ENABLED: process.env.EVAL_ENABLED === 'true' || 
                process.env.NEXT_PUBLIC_EVAL_ENABLED === 'true' || 
                (process.env.NODE_ENV !== 'test'),
  GENERATION_EVAL: process.env.GENERATION_EVAL === 'true' || 
                   process.env.NEXT_PUBLIC_GENERATION_EVAL === 'true' || 
                   (process.env.NODE_ENV !== 'test'),
  MEMORY_EVAL: process.env.MEMORY_EVAL === 'true' || false,
  CONTEXT_EVAL: process.env.CONTEXT_EVAL === 'true' || false,
  PROMPT_EVAL: process.env.PROMPT_EVAL === 'true' || false,
  EVALUATION_RUNTIME: process.env.EVALUATION_RUNTIME === 'true' || false,
  AUTO_EVALUATION: process.env.AUTO_EVALUATION === 'true' || false,
  EXPERIMENTS_ENABLED: process.env.EXPERIMENTS_ENABLED === 'true' || false,
  STRICT_EVALUATION: process.env.STRICT_EVALUATION === 'true' || false,
  BLOCK_ON_FAIL: process.env.BLOCK_ON_FAIL === 'true' || false,
};
