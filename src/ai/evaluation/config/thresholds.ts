function parseThreshold(envValue: string | undefined, defaultValue: number): number {
  if (envValue === undefined) return defaultValue;
  const num = Number(envValue);
  if (isNaN(num) || num < 0 || num > 100) {
    console.warn(`[EvaluationThresholds] Invalid threshold value "${envValue}". Clamping to default: ${defaultValue}`);
    return defaultValue;
  }
  return num;
}

export interface ThresholdConfig {
  fail: number;
  warn: number;
}

export interface EvaluationThresholds {
  relevance: ThresholdConfig;
  grounding: ThresholdConfig;
  responseQuality: ThresholdConfig;
  contextUsage: ThresholdConfig;
  llmJudge: ThresholdConfig;
}

export const evaluationThresholds: EvaluationThresholds = {
  relevance: {
    fail: parseThreshold(process.env.EVAL_THRESHOLD_RELEVANCE_FAIL, 60),
    warn: parseThreshold(process.env.EVAL_THRESHOLD_RELEVANCE_WARN, 80)
  },
  grounding: {
    fail: parseThreshold(process.env.EVAL_THRESHOLD_GROUNDING_FAIL, 60),
    warn: parseThreshold(process.env.EVAL_THRESHOLD_GROUNDING_WARN, 80)
  },
  responseQuality: {
    fail: parseThreshold(process.env.EVAL_THRESHOLD_RESPONSE_QUALITY_FAIL, 60),
    warn: parseThreshold(process.env.EVAL_THRESHOLD_RESPONSE_QUALITY_WARN, 80)
  },
  contextUsage: {
    fail: parseThreshold(process.env.EVAL_THRESHOLD_CONTEXT_USAGE_FAIL, 60),
    warn: parseThreshold(process.env.EVAL_THRESHOLD_CONTEXT_USAGE_WARN, 80)
  },
  llmJudge: {
    fail: parseThreshold(process.env.EVAL_THRESHOLD_LLM_JUDGE_FAIL, 60),
    warn: parseThreshold(process.env.EVAL_THRESHOLD_LLM_JUDGE_WARN, 80)
  }
};
