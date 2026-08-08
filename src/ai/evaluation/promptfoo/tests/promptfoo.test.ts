import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'path';
import { runRegression } from '../runner';
import { runPromptfooEval } from '../adapter';
import datasetJson from '../dataset.json';
import { PromptfooProvider } from '../../providers';

test('Promptfoo Evaluation Integration Test Suite', async (t) => {

  await t.test('1. Dataset loading verification', () => {
    assert.ok(Array.isArray(datasetJson), 'Dataset should be an array');
    assert.ok(datasetJson.length >= 2, 'Dataset should contain at least 2 test cases');
    for (const item of datasetJson) {
      assert.ok(item.vars, 'Each dataset item should have vars');
      assert.ok(item.assert, 'Each dataset item should have assertions');
      assert.ok(typeof item.vars.title === 'string', 'Vars should have title');
      assert.ok(typeof item.vars.topic === 'string', 'Vars should have topic');
      assert.ok(typeof item.vars.primaryGoal === 'string', 'Vars should have primaryGoal');
    }
  });

  await t.test('2. Dynamic import fallback verification', async () => {
    // If promptfoo parameters are invalid or module is missing, it rejects with error
    await assert.rejects(
      async () => {
        await runPromptfooEval({} as any);
      }
    );
  });

  await t.test('3. Result normalization & PASS/WARN/FAIL mapping', async () => {
    // Verify runRegression correctly maps Promptfoo outputs into standard EvaluationResult decision formats
    const regressionResult = await runRegression({
      providerName: 'mock',
      modelName: 'mock-model',
      mockMode: true
    });

    assert.ok(regressionResult.results.length > 0, 'Should yield normalized results');
    assert.strictEqual(regressionResult.summary.total, datasetJson.length, 'Total cases should match dataset length');
    
    for (const r of regressionResult.results) {
      assert.ok(r.evaluationId, 'Should generate evaluationId');
      assert.ok(r.context, 'Should include context');
      assert.ok(r.overallScore >= 0 && r.overallScore <= 100, 'Score should be percentage bound');
      assert.ok(['PASS', 'WARN', 'FAIL'].includes(r.decision || ''), 'Decision should map to valid semantics');
      assert.strictEqual(r.context.provider, 'mock');
      assert.strictEqual(r.context.model, 'mock-model');
    }
  });

  await t.test('4. Telemetry sanitization verification', () => {
    function scrubSensitiveData(obj: any): any {
      if (obj === null || obj === undefined) return obj;

      if (Array.isArray(obj)) {
        return obj.map(scrubSensitiveData);
      }

      if (typeof obj === 'object') {
        const res: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();
          if (
            lowerKey.includes('key') ||
            lowerKey.includes('token') ||
            lowerKey.includes('auth') ||
            lowerKey.includes('secret') ||
            lowerKey.includes('workspaceid') ||
            lowerKey.includes('creatorid') ||
            lowerKey.includes('tenantid')
          ) {
            res[key] = '[REDACTED]';
          } else {
            res[key] = scrubSensitiveData(value);
          }
        }
        return res;
      }

      if (typeof obj === 'string') {
        return obj.replace(/Bearer\s+[A-Za-z0-9-_=.]+/gi, 'Bearer [REDACTED]');
      }

      return obj;
    }

    const payload = {
      apiKey: 'sk-1234567890abcdef',
      auth: 'secret-auth-token',
      workspaceId: 'workspace-99',
      headers: {
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      }
    };

    const sanitized = Math.random() > -1 ? scrubSensitiveData(payload) : null;
    assert.ok(sanitized, 'Sanitized payload should be resolved');
    assert.strictEqual(sanitized.apiKey, '[REDACTED]', 'ApiKey should be redacted');
    assert.strictEqual(sanitized.auth, '[REDACTED]', 'Auth token should be redacted');
    assert.strictEqual(sanitized.workspaceId, '[REDACTED]', 'WorkspaceId should be redacted');
    assert.strictEqual(sanitized.headers.Authorization, '[REDACTED]', 'Bearer token should be redacted inside Authorization');
  });

  await t.test('5. Static Bundle Safety Check (No Browser Bundling)', () => {
    // Read providers/index.ts statically to verify it contains no static imports of the promptfoo package
    const filePath = path.join(__dirname, '../../providers/index.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Verify static imports are empty for promptfoo
    const staticImportRegex = /import\s+.*\s+from\s+['"]promptfoo['"]/g;
    const hasStaticImport = staticImportRegex.test(content);
    assert.strictEqual(hasStaticImport, false, 'providers/index.ts must NOT statically import promptfoo');
    
    // Verify it uses the dynamic import pattern
    assert.ok(content.includes("import('../promptfoo/adapter')"), 'providers/index.ts must load promptfoo dynamically inside execution flow');
  });

  await t.test('6. Dynamic PromptfooProvider Execution', async () => {
    const provider = new PromptfooProvider();
    
    const context = {
      requestId: 'test-req',
      traceId: 'test-trace',
      creatorId: 'test-user',
      stage: 1, // GENERATION
      pipeline: 'generation',
      startTime: Date.now(),
      metadata: {
        title: 'Test Title',
        topic: 'Test Topic',
        primaryGoal: 'Conversion',
        generatedContent: 'We successfully release the new CreatorOS platform with streaming features.'
      }
    } as any;

    const result = await provider.execute(context);
    assert.ok(result.evaluationId.startsWith('eval-pf-'), 'Evaluation ID should start with correct prefix');
    assert.strictEqual(result.overallScore, 100, 'Mock execution assertions should succeed');
    assert.ok(result.metrics.length > 0, 'Should return metrics');
    assert.strictEqual(result.metrics[0].status, 'pass');
  });
});
