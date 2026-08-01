import { z } from 'zod';
import { EvaluationStage, EvaluationStatus } from '../types';

export const evaluationStageSchema = z.nativeEnum(EvaluationStage);
export const evaluationStatusSchema = z.nativeEnum(EvaluationStatus);

export const evaluationContextSchema = z.object({
  requestId: z.string().min(1, 'Request ID is required.'),
  creatorId: z.string().min(1, 'Creator ID is required.'),
  sessionId: z.string().optional(),
  pipelineId: z.string().optional(),
  stage: evaluationStageSchema,
  provider: z.string().min(1, 'Provider identifier is required.'),
  model: z.string().min(1, 'Model name is required.'),
  promptVersion: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const evaluationMetricSchema = z.object({
  metricId: z.string().min(1),
  name: z.string().min(1),
  score: z.number().min(0).max(100),
  weight: z.number().min(0.0).max(1.0),
  confidence: z.number().min(0.0).max(1.0),
  status: z.enum(['pass', 'fail', 'warning']),
  reason: z.string().min(1),
});

export const evaluationResultSchema = z.object({
  evaluationId: z.string().min(1),
  context: evaluationContextSchema,
  status: evaluationStatusSchema,
  metrics: z.array(evaluationMetricSchema),
  overallScore: z.number().min(0).max(100),
  latencyMs: z.number().nonnegative(),
  errorMessage: z.string().optional(),
  createdAt: z.string().datetime(),
});

export const evaluationConfigSchema = z.object({
  providerName: z.string().min(1),
  stage: evaluationStageSchema,
  metrics: z.array(z.string()),
  thresholds: z.record(z.string(), z.number().min(0).max(100)).optional(),
});
