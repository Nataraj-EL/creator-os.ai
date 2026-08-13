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
  tenantId?: string;
  workspaceId?: string;
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
  console.log(`[Promptfoo-Runner] Initializing runRegression. MockMode: ${options.mockMode}, Tenant: ${options.tenantId}, Workspace: ${options.workspaceId}`);
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
          options.workspaceId || 'ws-a',
          title,
          topic,
          primaryGoal,
          {
            provider: options.providerName,
            model: options.modelName,
            tenantId: options.tenantId || 'tenant-a'
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
    console.log(`[Promptfoo-Runner] Invoking runPromptfooEval with ${evaluateOptions.tests?.length} test cases`);
    const pfSummary = await runPromptfooEval(evaluateOptions);
    console.log(`[Promptfoo-Runner] runPromptfooEval completed successfully. Results count: ${pfSummary.results?.length}`);

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
          requestId: `req-pf-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          creatorId: 'eval-system-user',
          stage: EvaluationStage.GENERATION,
          provider: 'Promptfoo',
          model: options.modelName || 'regression-suite',
          metadata: {
            vars: r.vars,
            prompt: r.prompt?.raw,
            startTime: Date.now() - r.latencyMs,
            tenantId: options.tenantId || 'tenant-a',
            workspaceId: options.workspaceId || 'ws-a',
            tokenUsage: { prompt: 100, completion: 150, total: 250 },
            estimatedCost: options.providerName === 'mock' ? 0.0 : 0.0001
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
    const totalLatency = results.reduce((sum: number, r: EvaluationResult) => sum + r.latencyMs, 0);
    const totalCost = results.reduce((sum: number, r: EvaluationResult) => sum + (r.context.metadata?.estimatedCost || 0.0), 0);

    // Collect names of failed test cases without sensitive prompts/generatedContent
    const failedCases = results
      .filter((r: EvaluationResult) => r.status === EvaluationStatus.FAILED)
      .map((r: EvaluationResult, idx: number) => {
        const title = r.context.metadata?.vars?.title || `Test Case #${idx + 1}`;
        const reason = r.metrics.find(m => m.status === 'fail')?.reason || 'Assertion check failed';
        return `${title}: ${reason}`;
      });

    // Create a single overall regression summary to persist
    const runId = `pf-run-${Math.random().toString(36).substring(2, 9)}`;
    const summaryResult: EvaluationResult = {
      evaluationId: `eval-${runId}`,
      context: {
        requestId: `req-${runId}`,
        creatorId: 'eval-system-user',
        stage: EvaluationStage.GENERATION,
        provider: 'Promptfoo',
        model: options.modelName || 'regression-suite',
        metadata: {
          datasetVersion: "1.0.0",
          passCount: passed,
          failCount: failed,
          totalCount: total,
          tokenUsage: { prompt: 100 * total, completion: 150 * total, total: 250 * total },
          estimatedCost: totalCost,
          failedCases,
          tenantId: options.tenantId || 'tenant-a',
          workspaceId: options.workspaceId || 'ws-a'
        }
      },
      status: failed === 0 ? EvaluationStatus.COMPLETED : EvaluationStatus.FAILED,
      metrics: [], // Do NOT persist prompts, raw metrics, or assertions details
      overallScore: total > 0 ? Math.round((passed / total) * 100) : 0,
      latencyMs: totalLatency,
      createdAt: new Date().toISOString(),
      decision: failed === 0 ? 'PASS' : 'FAIL'
    };

    // Save ONLY the sanitized regression run summary to the repository
    console.log(`[Promptfoo-Runner] Attempting to save summaryResult (id: ${summaryResult.evaluationId}, provider: ${summaryResult.context.provider}, model: ${summaryResult.context.model}) to repository`);
    const { EvaluationRepositoryFactory } = await import('../storage/repositoryFactory');
    const repo = EvaluationRepositoryFactory.getRepository();
    await repo.save(summaryResult)
      .then(() => {
        console.log(`[Promptfoo-Runner] Successfully saved summaryResult (id: ${summaryResult.evaluationId}) to repository`);
      })
      .catch(err => {
        console.error(`[Promptfoo-Runner] Failed to persist summaryResult (id: ${summaryResult.evaluationId}) to repository:`, err.stack || err.message);
      });

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
