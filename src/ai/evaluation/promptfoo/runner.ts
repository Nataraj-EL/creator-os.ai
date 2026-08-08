import { generateContent } from '../../../lib/generationService';
import { calculateDecision } from '../utils/decision';
import { EvaluationResult, EvaluationStatus, EvaluationStage } from '../types';
import { runPromptfooEval } from './adapter';
import { providerRegistry } from '../../providers/registry';
import { apiClient } from '../../../lib/api-client';
import datasetJson from './dataset.json';

export interface RunnerOptions {
  providerName: string;
  modelName: string;
  mockMode?: boolean;
}

export async function runRegression(options: RunnerOptions): Promise<{
  results: EvaluationResult[];
  summary: {
    success: boolean;
    total: number;
    passed: number;
    failed: number;
  };
}> {
  const originalPost = apiClient.post;
  const originalResolve = providerRegistry.resolve;

  // 1. Setup credential-free stubs if running mock mode
  if (options.mockMode) {
    apiClient.post = async () => {
      return {
        data: {
          projectId: 'project-mock-123',
          title: 'Title',
          topic: 'Topic',
          scriptDraft: 'Generated mock script content containing CreatorOS and artificial intelligence',
          generatedContent: 'Generated mock script content containing CreatorOS and artificial intelligence',
          content: 'Generated mock script content containing CreatorOS and artificial intelligence'
        }
      } as any;
    };

    // Ensure mock provider is registered
    try {
      providerRegistry.resolve('mock');
    } catch {
      providerRegistry.register({
        name: 'mock',
        capabilities: { streaming: false },
        generate: async () => ({
          content: 'Generated mock script content containing CreatorOS and artificial intelligence',
          model: 'mock-model'
        })
      } as any);
    }
  }

  // 2. Custom Promptfoo provider implementation wrapping generateContent
  const customProvider = {
    id: () => `creator-os-${options.providerName}-${options.modelName}`,
    callApi: async (prompt: string, context: any) => {
      const { title, topic, primaryGoal } = context.vars;

      try {
        const genResult = await generateContent(
          'eval-system-user',
          'eval-system-workspace',
          title,
          topic,
          primaryGoal,
          {
            provider: options.providerName,
            model: options.modelName
          }
        );

        const content = genResult.data?.scriptDraft || 
                        genResult.data?.generatedContent || 
                        genResult.data?.content || 
                        '';

        return {
          output: content,
          tokenUsage: { prompt: 100, completion: 150, total: 250 },
          cost: options.providerName === 'mock' ? 0.0 : 0.0001
        };
      } catch (err: any) {
        return {
          error: err.message
        };
      }
    }
  };

  const evaluateOptions = {
    prompts: [
      'You are CreatorOS AI content generator. Title: {{title}}. Primary Goal: {{primaryGoal}}.\n\nTopic: {{topic}}'
    ],
    providers: [customProvider],
    tests: datasetJson
  };

  try {
    const pfSummary = await runPromptfooEval(evaluateOptions);

    const results = pfSummary.results.map((r: any) => {
      const overallScore = Math.round((r.gradingResult?.score || (r.success ? 1.0 : 0.0)) * 100);
      
      const componentResults = r.gradingResult?.componentResults || [];
      const metrics = componentResults.map((c: any, idx: number) => {
        const score = Math.round(c.score * 100);
        let status: 'pass' | 'fail' | 'warning' = 'pass';
        if (score < 60) status = 'fail';
        else if (score < 80) status = 'warning';

        return {
          metricId: c.assertion?.metric || `assert-${idx}`,
          name: `Assertion: ${c.assertion?.type || 'match'}`,
          score,
          weight: 1.0,
          confidence: 0.95,
          status,
          reason: c.reason || (c.pass ? 'Assertion passed' : 'Assertion failed')
        };
      });

      // Map single overall score into expected decision categories
      const scoresMap = {
        relevance: overallScore,
        grounding: overallScore,
        responseQuality: overallScore,
        contextUsage: overallScore,
        llmJudge: overallScore
      };

      const decision = calculateDecision(scoresMap, ['relevance', 'grounding', 'responseQuality', 'contextUsage', 'llmJudge']);

      return {
        evaluationId: `eval-pf-${Math.random().toString(36).substring(2, 9)}`,
        context: {
          requestId: `req-pf-${Date.now()}`,
          creatorId: 'eval-system-user',
          stage: EvaluationStage.GENERATION,
          provider: options.providerName,
          model: options.modelName,
          metadata: {
            vars: r.vars,
            prompt: r.prompt?.raw,
            startTime: Date.now() - r.latencyMs
          }
        },
        status: r.success ? EvaluationStatus.COMPLETED : EvaluationStatus.FAILED,
        metrics,
        overallScore,
        latencyMs: r.latencyMs,
        createdAt: new Date().toISOString(),
        decision
      } as EvaluationResult;
    });

    const total = results.length;
    const passed = results.filter((r: EvaluationResult) => r.status === EvaluationStatus.COMPLETED).length;
    const failed = total - passed;

    return {
      results,
      summary: {
        success: failed === 0,
        total,
        passed,
        failed
      }
    };
  } finally {
    // 3. Restore stubs
    apiClient.post = originalPost;
    providerRegistry.resolve = originalResolve;
  }
}
