import test from 'node:test';
import assert from 'node:assert';
import { LlmJudgeProvider } from '../providers';
import { EvaluationStage, EvaluationStatus, EvaluationResult } from '../types';
import { evaluationService } from '../services';
import { EvaluationRepositoryFactory } from '../storage/repositoryFactory';
import { InMemoryEvaluationRepository } from '../storage/postgresEvaluationRepository';

// Setup environment variables for testing
process.env.GEMINI_API_KEY = 'mock-api-key';

test('Gemini Evaluation Engine & Normalization Regression Suite', async (t) => {

  const context = {
    requestId: 'req-gemini-test-123',
    creatorId: 'creator-999',
    stage: EvaluationStage.GENERATION,
    provider: 'Backend-API',
    model: 'Backend-LLM',
    metadata: {
      inputPrompt: 'Write a tech shorts script about anti-gravity',
      generatedContent: 'Antigravity allows floating objects easily.',
      tenantId: 'tenant-test',
      workspaceId: 'ws-test'
    }
  };

  await t.test('1. Successful standard response parsing & score scaling', async () => {
    const originalCallLlm = (LlmJudgeProvider.prototype as any).callLlmWithBackoff;
    (LlmJudgeProvider.prototype as any).callLlmWithBackoff = async () => {
      return {
        text: JSON.stringify({
          relevance: { score: 9, reason: 'Highly relevant' },
          faithfulness: { score: 8, reason: 'Factually sound' },
          creatorVoice: { score: 9.5, reason: 'Strong voice' },
          platformSuitability: { score: 10, reason: 'Perfect formatting' },
          engagement: { score: 7, reason: 'Average hooks' },
          readability: { score: 8, reason: 'Easy reading' },
          actionability: { score: 6, reason: 'Moderate CTA' },
          overallScore: 85,
          confidence: 0.95,
          reasoning: 'Good overall output.'
        }),
        resolvedModel: 'gemini-1.5-pro'
      };
    };

    try {
      const provider = new LlmJudgeProvider();
      const result = await provider.execute(context);
      assert.strictEqual(result.status, EvaluationStatus.COMPLETED);
      assert.strictEqual(result.overallScore, 85);
      
      // Verification: scores <= 10 are scaled to 0-100
      const relevanceMetric = result.metrics.find(m => m.metricId === 'relevance');
      assert.strictEqual(relevanceMetric?.score, 90);
      assert.strictEqual(relevanceMetric?.status, 'pass');
      
      const actionabilityMetric = result.metrics.find(m => m.metricId === 'actionability');
      assert.strictEqual(actionabilityMetric?.score, 60);
      assert.strictEqual(actionabilityMetric?.status, 'warning');
    } finally {
      (LlmJudgeProvider.prototype as any).callLlmWithBackoff = originalCallLlm;
    }
  });

  await t.test('2. Gemini snake_case and string-based scores normalization', async () => {
    const originalCallLlm = (LlmJudgeProvider.prototype as any).callLlmWithBackoff;
    (LlmJudgeProvider.prototype as any).callLlmWithBackoff = async () => {
      // Simulate real-world variation with snake_case keys, string scores, and custom formatting
      return {
        text: `
          Some conversational intro text...
          \`\`\`json
          {
            "relevance": "9.5",
            "faithfulness": "8.0",
            "creator_voice": { "score": "9", "reason": "Consistent voice" },
            "platform_suitability": { "score": 9.5 },
            "engagement": "7.5",
            "readability": 8,
            "actionability": { "score": "5.5", "reason": "Weak CTA" },
            "overall_score": "82",
            "confidence": "0.92"
          }
          \`\`\`
        `,
        resolvedModel: 'gemini-1.5-pro'
      };
    };

    try {
      const provider = new LlmJudgeProvider();
      const result = await provider.execute(context);
      assert.strictEqual(result.status, EvaluationStatus.COMPLETED);
      assert.strictEqual(result.overallScore, 82);
      
      const voice = result.metrics.find(m => m.metricId === 'creatorVoice');
      assert.strictEqual(voice?.score, 90);
      assert.strictEqual(voice?.status, 'pass');

      const suit = result.metrics.find(m => m.metricId === 'platformSuitability');
      assert.strictEqual(suit?.score, 95);

      const action = result.metrics.find(m => m.metricId === 'actionability');
      assert.strictEqual(action?.score, 55);
      assert.strictEqual(action?.status, 'fail'); // < 60 is fail
    } finally {
      (LlmJudgeProvider.prototype as any).callLlmWithBackoff = originalCallLlm;
    }
  });

  await t.test('3. Malformed and empty response handling checks', async () => {
    const originalCallLlm = (LlmJudgeProvider.prototype as any).callLlmWithBackoff;

    try {
      const provider = new LlmJudgeProvider();

      // 3.1 Malformed non-JSON text
      (LlmJudgeProvider.prototype as any).callLlmWithBackoff = async () => ({
        text: 'The text script looks okay but has grammar flaws.',
        resolvedModel: 'gemini-1.5-pro'
      });

      await assert.rejects(
        provider.execute(context),
        /\[EVALUATION_ERROR\].*JSON/i
      );

      // 3.2 Empty text response
      (LlmJudgeProvider.prototype as any).callLlmWithBackoff = async () => ({
        text: '   ',
        resolvedModel: 'gemini-1.5-pro'
      });

      await assert.rejects(
        provider.execute(context),
        /Empty response text/i
      );
    } finally {
      (LlmJudgeProvider.prototype as any).callLlmWithBackoff = originalCallLlm;
    }
  });

  await t.test('4. Evaluator-provider separation & context preservation', async () => {
    const memoryRepo = new InMemoryEvaluationRepository();
    EvaluationRepositoryFactory.registerRepository(memoryRepo);
    (evaluationService as any).repository = memoryRepo;

    // Mock successful LLM-Judge output
    const originalCallLlm = (LlmJudgeProvider.prototype as any).callLlmWithBackoff;
    (LlmJudgeProvider.prototype as any).callLlmWithBackoff = async () => ({
      text: JSON.stringify({
        relevance: 9, faithfulness: 9, creatorVoice: 9, platformSuitability: 9, engagement: 9, readability: 9, actionability: 9,
        overallScore: 90
      }),
      resolvedModel: 'gemini-1.5-pro'
    });

    try {
      const result = await evaluationService.evaluate(context);
      
      assert.strictEqual(result.status, EvaluationStatus.COMPLETED);
      assert.strictEqual(result.decision, 'PASS');
      
      // Provider and model fields in context must reflect generation source, not the judge
      assert.strictEqual(result.context.provider, 'Backend-API');
      assert.strictEqual(result.context.model, 'Backend-LLM');
      
      // Judge model info is preserved in metadata
      assert.strictEqual(result.context.metadata?.judgeModel, 'gemini-1.5-pro');
    } finally {
      (LlmJudgeProvider.prototype as any).callLlmWithBackoff = originalCallLlm;
    }
  });

  await t.test('5. Fails and persists with structured error messages', async () => {
    const memoryRepo = new InMemoryEvaluationRepository();
    EvaluationRepositoryFactory.registerRepository(memoryRepo);
    (evaluationService as any).repository = memoryRepo;

    const originalCallLlm = (LlmJudgeProvider.prototype as any).callLlmWithBackoff;
    (LlmJudgeProvider.prototype as any).callLlmWithBackoff = async () => {
      throw new Error('API key is unauthorized.');
    };

    try {
      const result = await evaluationService.evaluate(context);
      
      // Must be marked FAILED with overallScore 0 and no decision
      assert.strictEqual(result.status, EvaluationStatus.FAILED);
      assert.strictEqual(result.overallScore, 0);
      assert.strictEqual(result.decision, undefined);
      assert.ok(result.errorMessage?.startsWith('[AUTHENTICATION_ERROR]'), 'Should classify API key authorization as AUTHENTICATION_ERROR');

      // Verify persisted result in repository
      const saved = await memoryRepo.getById(result.evaluationId, 'tenant-test', 'ws-test');
      assert.ok(saved);
      assert.strictEqual(saved.status, EvaluationStatus.FAILED);
      assert.strictEqual(saved.decision, undefined);
    } finally {
      (LlmJudgeProvider.prototype as any).callLlmWithBackoff = originalCallLlm;
    }
  });
});
