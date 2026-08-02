import test from 'node:test';
import assert from 'node:assert';
import { 
  evaluationRunner, 
  experimentService, 
  experimentAnalyticsService,
  Evaluator,
  EvaluatorResult,
  Experiment,
  EvaluationSuiteResult
} from '../runtime';
import { EvaluationStatus } from '../types';
import { featureFlags } from '../config/featureFlags';
import { EvaluationRuntimeMiddleware } from '../../middleware/builtins/evaluationRuntimeMiddleware';

test('AI Evaluation & Experiment Runtime Test Suite', async (t) => {

  t.beforeEach(() => {
    // Clear registry and services for fresh runs
    experimentService.clear();
    experimentAnalyticsService.clear();
  });

  await t.test('1. Dynamic Evaluator Registration & Unregistration', async () => {
    const customEvaluator: Evaluator = {
      name: 'customCheck',
      async evaluate(content: string) {
        return {
          name: 'customCheck',
          score: 85,
          reason: 'Custom verification succeeded.',
          metadata: {}
        };
      }
    };

    evaluationRunner.registerEvaluator(customEvaluator);
    
    const suite = await evaluationRunner.runSuite('Check relevance usage content.', {
      traceId: 'tr-reg-1',
      requestId: 'req-reg-1'
    });

    assert.ok(suite.results.customCheck);
    assert.strictEqual(suite.results.customCheck.score, 85);

    // Unregister and verify it is no longer executed
    evaluationRunner.unregisterEvaluator('customCheck');
    const suite2 = await evaluationRunner.runSuite('Check relevance usage content.', {
      traceId: 'tr-reg-2',
      requestId: 'req-reg-2'
    });
    assert.strictEqual(suite2.results.customCheck, undefined);
  });

  await t.test('2. Variant Selection Strategies (Fixed, Random, Weighted)', async () => {
    const exp: Experiment = {
      experimentId: 'exp-strat-1',
      name: 'Hook Template Experiment',
      selectionStrategy: 'fixed',
      activeVariantId: 'var-2',
      variants: [
        { variantId: 'var-1', name: 'Variant 1', promptTemplate: 'Template 1' },
        { variantId: 'var-2', name: 'Variant 2', promptTemplate: 'Template 2' },
        { variantId: 'var-3', name: 'Variant 3', promptTemplate: 'Template 3' }
      ]
    };

    experimentService.registerExperiment(exp);

    // Test Fixed Selection
    const assignFixed = await experimentService.assignVariant('exp-strat-1', 'tr-fixed-1');
    assert.strictEqual(assignFixed.variantId, 'var-2');

    // Test Random Selection
    exp.selectionStrategy = 'random';
    const randomAssignments = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const a = await experimentService.assignVariant('exp-strat-1', `tr-rand-${i}`);
      randomAssignments.add(a.variantId);
    }
    // With 20 iterations, it's highly probable to hit multiple variants
    assert.ok(randomAssignments.size > 1, 'Expected random strategy to select multiple variants');

    // Test Weighted Selection
    exp.selectionStrategy = 'weighted';
    exp.variants[0].weight = 10.0;
    exp.variants[1].weight = 0.0;
    exp.variants[2].weight = 0.0;

    const assignWeighted = await experimentService.assignVariant('exp-strat-1', 'tr-weighted-1');
    assert.strictEqual(assignWeighted.variantId, 'var-1', 'Expected weighted selector to pick highly weighted variant');
  });

  await t.test('3. Configurable Evaluation Weights Score Arithmetic', async () => {
    // Run suite with default weights (all 1.0)
    const suiteDefault = await evaluationRunner.runSuite('Relevance usage content for brand styling requirements.', {
      traceId: 'tr-wt-1',
      requestId: 'req-wt-1',
      prompt: 'brand styling requirements',
      blocks: [{ id: 'blk-1', content: 'relevance usage content for brand styling requirements', source: 'memory', tokenCount: 10, relevanceScore: 1 }]
    });

    const relevanceScore = suiteDefault.results.relevance.score;
    const contextUsageScore = suiteDefault.results.contextUsage.score;
    const groundingScore = suiteDefault.results.grounding.score;
    const responseQualityScore = suiteDefault.results.responseQuality.score;

    // Apply custom weights
    evaluationRunner.setWeights({
      relevance: 10.0,
      contextUsage: 0.0,
      grounding: 0.0,
      responseQuality: 0.0
    });

    const suiteWeighted = await evaluationRunner.runSuite('Relevance usage content for brand styling requirements.', {
      traceId: 'tr-wt-2',
      requestId: 'req-wt-2',
      prompt: 'brand styling requirements',
      blocks: [{ id: 'blk-1', content: 'relevance usage content for brand styling requirements', source: 'memory', tokenCount: 10, relevanceScore: 1 }]
    });

    // Restore weights
    evaluationRunner.setWeights({
      relevance: 1.0,
      contextUsage: 1.0,
      grounding: 1.0,
      responseQuality: 1.0
    });

    // Overall score should equal relevance score exactly due to 10.0 weight vs 0.0 on others
    assert.strictEqual(suiteWeighted.overallScore, relevanceScore);
  });

  await t.test('4. Experiment Analytics Aggregation & Leader Identification', async () => {
    const exp: Experiment = {
      experimentId: 'exp-anal-1',
      name: 'Intro Tone Test',
      selectionStrategy: 'fixed',
      variants: [
        { variantId: 'var-a', name: 'Tone A', promptTemplate: 'Tone A Template' },
        { variantId: 'var-b', name: 'Tone B', promptTemplate: 'Tone B Template' }
      ]
    };

    experimentService.registerExperiment(exp);

    // Create assignments
    await experimentService.assignVariant('exp-anal-1', 'tr-anal-a');
    exp.activeVariantId = 'var-b';
    await experimentService.assignVariant('exp-anal-1', 'tr-anal-b');

    // Create mocked suite results
    const suiteA: EvaluationSuiteResult = {
      suiteId: 'st-a',
      traceId: 'tr-anal-a',
      requestId: 'req-anal-a',
      variantId: 'var-a',
      overallScore: 90,
      status: 'completed',
      results: {
        relevance: { name: 'relevance', score: 90, reason: '', metadata: {} },
        contextUsage: { name: 'contextUsage', score: 90, reason: '', metadata: {} },
        grounding: { name: 'grounding', score: 90, reason: '', metadata: {} },
        responseQuality: { name: 'responseQuality', score: 90, reason: '', metadata: {} }
      },
      metadata: {},
      createdAt: new Date().toISOString()
    };

    const suiteB: EvaluationSuiteResult = {
      suiteId: 'st-b',
      traceId: 'tr-anal-b',
      requestId: 'req-anal-b',
      variantId: 'var-b',
      overallScore: 60,
      status: 'completed',
      results: {
        relevance: { name: 'relevance', score: 60, reason: '', metadata: {} },
        contextUsage: { name: 'contextUsage', score: 60, reason: '', metadata: {} },
        grounding: { name: 'grounding', score: 60, reason: '', metadata: {} },
        responseQuality: { name: 'responseQuality', score: 60, reason: '', metadata: {} }
      },
      metadata: {},
      createdAt: new Date().toISOString()
    };

    await experimentAnalyticsService.saveSuiteResult(suiteA);
    await experimentAnalyticsService.saveSuiteResult(suiteB);

    const analytics = await experimentAnalyticsService.getExperimentAnalytics('exp-anal-1');

    assert.strictEqual(analytics.totalAssignments, 2);
    assert.strictEqual(analytics.variants.length, 2);

    const perfA = analytics.variants.find(v => v.variantId === 'var-a');
    const perfB = analytics.variants.find(v => v.variantId === 'var-b');

    assert.ok(perfA);
    assert.ok(perfB);
    assert.strictEqual(perfA.avgOverallScore, 90);
    assert.strictEqual(perfB.avgOverallScore, 60);

    // Tone A is winning
    assert.strictEqual(analytics.leaderVariantId, 'var-a');
  });

  await t.test('5. Safe Fail-Open Executor Logic', async () => {
    const crashingEvaluator: Evaluator = {
      name: 'crasher',
      async evaluate() {
        throw new Error('Fatal database disconnection inside evaluator check.');
      }
    };

    evaluationRunner.registerEvaluator(crashingEvaluator);

    const suite = await evaluationRunner.runSuite('Check relevance usage content.', {
      traceId: 'tr-fail-1',
      requestId: 'req-fail-1'
    });

    evaluationRunner.unregisterEvaluator('crasher');

    // Asserts suite completed successfully despite crashingEvaluator failures
    assert.strictEqual(suite.results.crasher.score, 0);
    assert.ok(suite.results.crasher.reason.includes('Evaluator crashed'));
    assert.ok(suite.results.relevance.score > 0);
  });

  await t.test('6. Middleware Execution Fail-Open Integration', async () => {
    // Disable master flags
    featureFlags.EVALUATION_RUNTIME = false;
    featureFlags.AUTO_EVALUATION = false;

    const mw = new EvaluationRuntimeMiddleware();
    const context = { traceId: 'tr-mw-1', requestId: 'req-mw-1' };
    const request = { topic: 'Testing topic' } as any;
    const response = { data: { scriptDraft: 'A short generated response script draft content.' } } as any;

    // Run after hook - should return immediately without throwing
    await mw.after(context as any, request, response);
    assert.ok(true);
  });

});
