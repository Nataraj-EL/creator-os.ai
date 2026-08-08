import { EvaluationDecision } from '../types';
import { evaluationThresholds, ThresholdConfig } from '../config/thresholds';

export interface EvaluationScores {
  relevance?: number;
  grounding?: number;
  responseQuality?: number;
  contextUsage?: number;
  llmJudge?: number;
}

export function calculateDecision(
  scores: EvaluationScores,
  expectedMetrics: (keyof EvaluationScores)[],
  customThresholds?: Record<string, Partial<ThresholdConfig>>
): EvaluationDecision {
  let finalDecision: EvaluationDecision = 'PASS';

  const defaultThresh = (key: keyof EvaluationScores) => {
    switch (key) {
      case 'relevance': return evaluationThresholds.relevance;
      case 'grounding': return evaluationThresholds.grounding;
      case 'responseQuality': return evaluationThresholds.responseQuality;
      case 'contextUsage': return evaluationThresholds.contextUsage;
      case 'llmJudge': return evaluationThresholds.llmJudge;
    }
  };

  for (const key of expectedMetrics) {
    const score = scores[key];
    const thresh = defaultThresh(key);
    const custom = customThresholds?.[key];
    const failThresh = custom?.fail ?? thresh.fail;
    const warnThresh = custom?.warn ?? thresh.warn;

    // Ensure missing metrics do not accidentally become a passing score.
    if (score === undefined || score === null || isNaN(score)) {
      return 'FAIL';
    }

    if (score < failThresh) {
      return 'FAIL';
    }
    if (score < warnThresh) {
      finalDecision = 'WARN';
    }
  }

  return finalDecision;
}
