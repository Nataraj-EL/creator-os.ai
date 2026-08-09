import test from 'node:test';
import assert from 'node:assert';
import { GET as getEvaluations } from '../../../app/api/evaluation/route';
import { PostgresEvaluationRepository, InMemoryEvaluationRepository } from '../storage/postgresEvaluationRepository';
import { EvaluationRepositoryFactory } from '../storage/repositoryFactory';
import { EvaluationResult, EvaluationStatus, EvaluationStage } from '../types';

test('Evaluation Dashboard & API Boundary Test Suite', async (t) => {

  const createMockToken = (userId: string, workspaceId: string, extra: Record<string, any> = {}): string => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(JSON.stringify({
      userId,
      workspaceId,
      tenantId: 'tenant-a',
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...extra
    })).toString('base64');
    return `${header}.${payload}.signature`;
  };

  const sampleResult: EvaluationResult = {
    evaluationId: 'eval-runtime-test123',
    context: {
      requestId: 'req-prod-001',
      creatorId: 'user-1',
      stage: EvaluationStage.GENERATION,
      provider: 'LLM-Judge',
      model: 'gemini-1.5-pro',
      metadata: {
        inputPrompt: 'Write a script hook.',
        generatedContent: 'Here is a finance content draft',
        tenantId: 'tenant-a',
        workspaceId: 'ws-allowed',
        tokenUsage: { prompt: 100, completion: 150, total: 250 },
        estimatedCost: 0.0001
      }
    },
    status: EvaluationStatus.COMPLETED,
    metrics: [
      { metricId: 'relevance', name: 'Relevance', score: 85, weight: 1, confidence: 0.9, status: 'pass', reason: 'Directly on topic.' }
    ],
    overallScore: 85,
    decision: 'PASS',
    latencyMs: 820,
    createdAt: new Date().toISOString()
  };

  const pfSampleResult: EvaluationResult = {
    evaluationId: 'eval-pf-run-test456',
    context: {
      requestId: 'req-pf-test456',
      creatorId: 'eval-system-user',
      stage: EvaluationStage.GENERATION,
      provider: 'mock',
      model: 'mock-model',
      metadata: {
        datasetVersion: '1.0.0',
        passCount: 2,
        failCount: 0,
        totalCount: 2,
        failedCases: [],
        tenantId: 'tenant-a',
        workspaceId: 'ws-allowed',
        tokenUsage: { prompt: 200, completion: 300, total: 500 },
        estimatedCost: 0.0
      }
    },
    status: EvaluationStatus.COMPLETED,
    metrics: [],
    overallScore: 100,
    decision: 'PASS',
    latencyMs: 150,
    createdAt: new Date().toISOString()
  };

  await t.test('1. API authentication & RBAC protection', async () => {
    // 1.1 Missing token
    const req1 = new Request('http://localhost/api/evaluation?workspaceId=ws-allowed', { method: 'GET' });
    const res1 = await getEvaluations(req1);
    assert.strictEqual(res1.status, 401);

    // 1.2 Malformed token
    const req2 = new Request('http://localhost/api/evaluation?workspaceId=ws-allowed', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer invalid-jwt' }
    });
    const res2 = await getEvaluations(req2);
    assert.strictEqual(res2.status, 401);
  });

  await t.test('2. Tenant and workspace IDOR boundary verification', async () => {
    // Allow workspace access to 'ws-allowed' but query 'ws-forbidden'
    const token = createMockToken('user-1', 'ws-allowed', { workspaces: ['ws-allowed'] });
    const req = new Request('http://localhost/api/evaluation?workspaceId=ws-forbidden', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const res = await getEvaluations(req);
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.match(body.error, /Inconsistent workspace authorization/);
  });

  await t.test('3. Repository fallback mechanics & initialization resilience', async () => {
    const invalidRepo = new PostgresEvaluationRepository('invalid_connection_string');
    await invalidRepo.initialize();
    
    // Invalid connection string should fall back to memory store instead of crashing
    assert.ok((invalidRepo as any).fallback instanceof InMemoryEvaluationRepository);

    // Try saving record through fallback repository path
    await invalidRepo.save(sampleResult);
    const fetched = await invalidRepo.getById('eval-runtime-test123', 'tenant-a', 'ws-allowed');
    assert.ok(fetched);
    assert.strictEqual(fetched.overallScore, 85);
  });

  await t.test('4. API Sanitization safeguards', async () => {
    const memoryRepo = new InMemoryEvaluationRepository();
    await memoryRepo.save(sampleResult);
    await memoryRepo.save(pfSampleResult);
    EvaluationRepositoryFactory.registerRepository(memoryRepo);

    const token = createMockToken('user-1', 'ws-allowed', { workspaces: ['ws-allowed'] });
    const req = new Request('http://localhost/api/evaluation?workspaceId=ws-allowed', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const res = await getEvaluations(req);
    assert.strictEqual(res.status, 200);

    const list = await res.json();
    assert.ok(Array.isArray(list));
    assert.strictEqual(list.length, 2);

    const sanitized = list.find((item: any) => item.evaluationId === 'eval-runtime-test123');
    assert.ok(sanitized);
    // Verified: critical metrics, scores, decision, tokens, latency, cost map cleanly
    assert.strictEqual(sanitized.decision, 'PASS');
    assert.strictEqual(sanitized.overallScore, 85);
    assert.strictEqual(sanitized.latencyMs, 820);
    assert.strictEqual(sanitized.tokenUsage.total, 250);
    assert.strictEqual(sanitized.estimatedCost, 0.0001);

    // VERIFY PROMPT AND GENERATED CONTENT ARE SECURELY STRIPPED AND REMOVED
    const responseString = JSON.stringify(sanitized);
    assert.ok(!responseString.includes('inputPrompt'));
    assert.ok(!responseString.includes('generatedContent'));
    assert.ok(!responseString.includes('Write a script hook'));
    assert.ok(!responseString.includes('Here is a finance content draft'));
  });

  await t.test('5. Promptfoo regression display & source segregation mapping', async () => {
    const token = createMockToken('user-1', 'ws-allowed', { workspaces: ['ws-allowed'] });
    const req = new Request('http://localhost/api/evaluation?workspaceId=ws-allowed', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const res = await getEvaluations(req);
    const list = await res.json();

    const pfRecord = list.find((item: any) => item.evaluationId === 'eval-pf-run-test456');
    assert.ok(pfRecord);
    assert.strictEqual(pfRecord.source, 'promptfoo');
    assert.strictEqual(pfRecord.overallScore, 100);
    assert.strictEqual(pfRecord.estimatedCost, 0.0);

    const runtimeRecord = list.find((item: any) => item.evaluationId === 'eval-runtime-test123');
    assert.ok(runtimeRecord);
    assert.strictEqual(runtimeRecord.source, 'runtime');
  });

  await t.test('6. Integration: Generate -> Evaluate -> Persist -> GET /api/evaluation', async () => {
    const memoryRepo = new InMemoryEvaluationRepository();
    EvaluationRepositoryFactory.registerRepository(memoryRepo);

    const token = createMockToken('user-1', 'ws-allowed', { workspaces: ['ws-allowed'] });
    
    const testEvalResult: EvaluationResult = {
      evaluationId: 'eval-integration-test-999',
      context: {
        requestId: 'req-integration-test-999',
        creatorId: 'user-1',
        stage: EvaluationStage.GENERATION,
        provider: 'LLM-Judge',
        model: 'gemini-1.5-pro',
        metadata: {
          inputPrompt: 'Integration Prompt',
          generatedContent: 'Integration Output Content',
          tenantId: 'tenant-a',
          workspaceId: 'ws-allowed'
        }
      },
      status: EvaluationStatus.COMPLETED,
      metrics: [],
      overallScore: 92,
      decision: 'PASS',
      latencyMs: 120,
      createdAt: new Date().toISOString()
    };
    
    await memoryRepo.save(testEvalResult);

    const req = new Request('http://localhost/api/evaluation?workspaceId=ws-allowed', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const res = await getEvaluations(req);
    assert.strictEqual(res.status, 200);
    const list = await res.json();
    
    const found = list.find((item: any) => item.evaluationId === 'eval-integration-test-999');
    assert.ok(found);
    assert.strictEqual(found.overallScore, 92);
    assert.strictEqual(found.context?.requestId, 'req-integration-test-999');
    assert.strictEqual(found.context?.metadata?.tenantId, undefined); // sensitive stripped
  });

  await t.test('7. Tenant and Workspace Isolation validation in repository & API', async () => {
    const memoryRepo = new InMemoryEvaluationRepository();
    EvaluationRepositoryFactory.registerRepository(memoryRepo);

    await memoryRepo.save(sampleResult);

    // Fetch using token from tenant-b
    const tokenB = createMockToken('user-2', 'ws-allowed', { tenantId: 'tenant-b', workspaces: ['ws-allowed'] });
    const req = new Request('http://localhost/api/evaluation?workspaceId=ws-allowed', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    
    const res = await getEvaluations(req);
    assert.strictEqual(res.status, 200);
    const list = await res.json();
    
    const found = list.find((item: any) => item.evaluationId === 'eval-runtime-test123');
    assert.ok(!found);
  });

  await t.test('8. Robustness: Missing context or metadata normalization verification', async () => {
    const memoryRepo = new InMemoryEvaluationRepository();
    
    // Save legacy mock result bypassing normal check constraints
    const mockRecord: any = {
      evaluationId: 'eval-legacy-malformed-777',
      context: {
        metadata: {
          tenantId: 'tenant-a',
          workspaceId: 'ws-allowed'
        }
      },
      status: EvaluationStatus.COMPLETED,
      metrics: [],
      overallScore: 80,
      latencyMs: 100,
      createdAt: new Date().toISOString()
    };
    (memoryRepo as any).records.set(mockRecord.evaluationId, mockRecord);
    EvaluationRepositoryFactory.registerRepository(memoryRepo);

    const token = createMockToken('user-1', 'ws-allowed', { workspaces: ['ws-allowed'] });
    const response = await getEvaluations(new Request('http://localhost/api/evaluation?workspaceId=ws-allowed', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    }));
    
    assert.strictEqual(response.status, 200);
    const list = await response.json();
    const found = list.find((item: any) => item.evaluationId === 'eval-legacy-malformed-777');
    assert.ok(found);
    assert.strictEqual(found.context?.requestId, 'N/A'); // normalized safely
  });
});
