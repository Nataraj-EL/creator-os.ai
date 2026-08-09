(process.env as any).NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert';
import { POST as postGenerate } from '../../../app/api/content/generate/route';
import { MemoryRuntime } from '../../memory/services';
import { MemoryProviderRegistry } from '../../memory/providers';
import { InMemoryWorkflowPersistenceStore } from '../../workflow/persistence';
import { WorkflowRuntime } from '../../workflow/runtime';
import { WorkflowRegistry } from '../../workflow/registry';
import { StepExecutorRegistry } from '../../workflow/executors';
import { WorkerRuntime } from '../../distributed/worker';
import { InMemoryQueueAdapter } from '../../distributed/queue';
import { Job } from '../../distributed/types';
import { MCPClientHub } from '../../mcp/client';
import { memoryFeatureFlags } from '../../memory/config/featureFlags';
import { LangfuseTraceProvider } from '../providers/langfuse';
import { featureFlags as distFeatureFlags } from '../../distributed/config/featureFlags';

test('Production Tenant & RBAC Consistency Test Suite', async (t) => {

  const createMockToken = (userId: string, workspaceId: string, extra: Record<string, any> = {}): string => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(JSON.stringify({ userId, workspaceId, exp: Math.floor(Date.now() / 1000) + 3600, ...extra })).toString('base64');
    return `${header}.${payload}.signature`;
  };

  await t.test('1. API Route rejects unauthenticated or missing tenant requests', async () => {
    // Missing Bearer token
    const reqNoAuth = new Request('http://localhost/api/content/generate', { method: 'POST' });
    const resNoAuth = await postGenerate(reqNoAuth);
    assert.strictEqual(resNoAuth.status, 401);

    // Mismatched / missing tenant in token
    const tokenNoTenant = createMockToken('user-1', 'ws-allowed', { workspaces: ['ws-allowed'] });
    const reqNoTenant = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenNoTenant}` },
      body: JSON.stringify({
        title: 'Missing Tenant Test',
        topic: 'Test details',
        workspaceId: 'ws-allowed'
      })
    });
    const resNoTenant = await postGenerate(reqNoTenant);
    assert.strictEqual(resNoTenant.status, 401);
  });

  await t.test('2. API Route rejects forged client scope parameter injection', async () => {
    const token = createMockToken('user-1', 'ws-allowed', { tenantId: 'tenant-a', workspaces: ['ws-allowed'] });
    
    // Injecting arbitrary extra fields in JSON body (e.g. trying to override tenantId or inject fake parameters)
    const req = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        title: 'Forged Scope Attempt',
        topic: 'Trying to inject tenantId parameter',
        workspaceId: 'ws-allowed',
        tenantId: 'tenant-fake-forged' // Not permitted by strict Zod schema!
      })
    });

    const res = await postGenerate(req);
    assert.strictEqual(res.status, 400); // Strict schema rejection!
    const data = await res.json();
    assert.match(data.error, /Parameter validation failed/);
  });

  await t.test('3. API Route rejects cross-workspace IDOR access attempts', async () => {
    const token = createMockToken('user-1', 'ws-allowed', { tenantId: 'tenant-a', workspaces: ['ws-allowed'] });
    
    const req = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        title: 'Cross Workspace Probe',
        topic: 'Attempting IDOR workspace traversal',
        workspaceId: 'ws-unauthorized'
      })
    });

    const res = await postGenerate(req);
    assert.strictEqual(res.status, 403); // Forbidden
  });

  await t.test('4. Memory runtime enforces strict tenant and workspace boundaries', async () => {
    const oldEnabled = memoryFeatureFlags.MEMORY_ENABLED;
    const oldWrite = memoryFeatureFlags.MEMORY_WRITE;
    const oldRead = memoryFeatureFlags.MEMORY_READ;
    
    memoryFeatureFlags.MEMORY_ENABLED = true;
    memoryFeatureFlags.MEMORY_WRITE = true;
    memoryFeatureFlags.MEMORY_READ = true;

    try {
      const registry = new MemoryProviderRegistry();
      const runtime = new MemoryRuntime(registry);
      
      const ctxA = {
        userId: 'user-a',
        metadata: { tenantId: 'tenant-a', workspaceId: 'ws-a' }
      };
      
      // Store record under tenant-a
      const record = await runtime.store(ctxA, 'Confidential strategy for tenant A', ['strategy'], 'BRAND' as any);
      assert.ok(record);

      // Attempt cross-tenant retrieve (tenant-b)
      const ctxB = {
        userId: 'user-b',
        metadata: { tenantId: 'tenant-b', workspaceId: 'ws-b' }
      };

      const crossRetrieve = await runtime.retrieve(ctxB, record.id);
      assert.strictEqual(crossRetrieve, null); // Blocked

      // Attempt cross-tenant update
      const crossUpdate = await runtime.update(ctxB, record.id, { content: 'forged' });
      assert.strictEqual(crossUpdate, null); // Blocked

      // Attempt cross-tenant delete
      const crossDelete = await runtime.delete(ctxB, record.id);
      assert.strictEqual(crossDelete, false); // Blocked

      // Missing metadata scope on retrieve must fail validation
      await assert.rejects(async () => {
        await runtime.retrieve({ userId: 'user-a' } as any, record.id);
      }, /Missing or unauthorized tenant/);
    } finally {
      memoryFeatureFlags.MEMORY_ENABLED = oldEnabled;
      memoryFeatureFlags.MEMORY_WRITE = oldWrite;
      memoryFeatureFlags.MEMORY_READ = oldRead;
    }
  });

  await t.test('5. Workflow persistence isolates executions and rejects missing scopes', async () => {
    const persistence = new InMemoryWorkflowPersistenceStore();
    
    const exec: any = {
      executionId: 'wf-exec-1',
      workflowId: 'wf-1',
      status: 'RUNNING',
      variables: {
        tenantId: 'tenant-a',
        workspaceId: 'ws-a'
      }
    };

    // Save success
    await persistence.saveExecution(exec);

    // Retrieve using cross-tenant scope returns null
    const crossRetrieve = await persistence.getExecution('wf-exec-1', 'tenant-b', 'ws-b');
    assert.strictEqual(crossRetrieve, null);

    // Missing scope checks must throw
    await assert.rejects(async () => {
      await persistence.getExecution('wf-exec-1', 'default', 'ws-a');
    }, /Missing or unauthorized tenant/);
  });

  await t.test('6. Workers DLQ out-of-scope tasks and prevent infinite loops', async () => {
    const queue = new InMemoryQueueAdapter();
    const workerScope = { tenantId: 'tenant-worker', workspaceId: 'ws-worker' };
    
    const worker = new WorkerRuntime('worker-1', queue, 1, {
      AGENT: async () => 'success'
    } as any, workerScope);

    // Queue job with mismatched scope
    const job: Job = {
      id: 'job-mismatch',
      type: 'AGENT',
      status: 'QUEUED',
      payload: {},
      metadata: {
        attempts: 0,
        priority: 10,
        tenantId: 'tenant-other',
        workspaceId: 'ws-other'
      },
      policy: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await queue.enqueue(job);

    const oldDist = distFeatureFlags.DISTRIBUTED_RUNTIME;
    const oldPool = distFeatureFlags.WORKER_POOL;
    distFeatureFlags.DISTRIBUTED_RUNTIME = true;
    distFeatureFlags.WORKER_POOL = true;

    try {
      worker.start();
      // Trigger poll: worker should move out-of-scope job to DEAD_LETTER instead of releasing it
      await (worker as any).poll();
      await worker.stop();
    } finally {
      distFeatureFlags.DISTRIBUTED_RUNTIME = oldDist;
      distFeatureFlags.WORKER_POOL = oldPool;
    }

    const result = await queue.getJob('job-mismatch');
    assert.strictEqual(result?.status, 'DEAD_LETTER'); // DLQ-ed successfully!
    assert.strictEqual(result?.workerId, 'worker-1');
  });

  await t.test('7. Telemetry hashes tenant/workspace parameters cleanly', () => {
    const provider = new LangfuseTraceProvider({ subscribe: () => {} } as any);
    
    const metadata = {
      tenantId: 'tenant-customer-abc-123',
      workspaceId: 'workspace-my-work',
      nonSensitiveValue: 'ok-to-read'
    };

    const scrubbed = (provider as any).scrubMetadata(metadata);

    // Check raw values are hashed (non-reversible string prefix)
    assert.ok(scrubbed.tenantId.startsWith('hash-'));
    assert.notStrictEqual(scrubbed.tenantId, 'tenant-customer-abc-123');

    assert.ok(scrubbed.workspaceId.startsWith('hash-'));
    assert.notStrictEqual(scrubbed.workspaceId, 'workspace-my-work');

    // Non-sensitive values are untouched
    assert.strictEqual(scrubbed.nonSensitiveValue, 'ok-to-read');
  });

  await t.test('8. MCP Hub gates tool execution scope', async () => {
    const hub = new MCPClientHub();
    await assert.rejects(async () => {
      await hub.invokeTool('server-invalid', 'run_tool', {}, {
        tenantId: 'tenant-a',
        workspaceId: 'ws-a',
        creatorId: 'user-1'
      });
    }, /No active session/);
  });
});
