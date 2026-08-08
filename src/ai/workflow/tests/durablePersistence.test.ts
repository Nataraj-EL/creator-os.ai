import test from 'node:test';
import assert from 'node:assert';
import { featureFlags } from '../config/featureFlags';
import { PostgresWorkflowPersistenceStore } from '../storage/postgresPersistence';
import { WorkflowExecution } from '../types';

class MockPgPool {
  public queries: Array<{ sql: string; params: any[] }> = [];
  public rows: any[] = [];
  public queryHook?: (sql: string, params: any[]) => any;

  public async query(sql: string, params: any[] = []) {
    this.queries.push({ sql, params });
    if (this.queryHook) {
      return this.queryHook(sql, params);
    }
    return { rows: this.rows, rowCount: this.rows.length };
  }

  public async end() {}
}

test('Durable Workflow & Agent Execution Test Suite', async (t) => {

  const originalEnv = { ...process.env };

  const clearEnv = () => {
    delete process.env.DATABASE_URL;
  };

  await t.test('1. Feature flag defaults', () => {
    assert.strictEqual(featureFlags.DURABLE_WORKFLOWS, false);
    assert.strictEqual(featureFlags.POSTGRES_WORKFLOW_PERSISTENCE, false);
  });

  await t.test('2. Missing credentials / disabled fallback during startup', async () => {
    clearEnv();
    featureFlags.POSTGRES_WORKFLOW_PERSISTENCE = false;

    const store = new PostgresWorkflowPersistenceStore('');
    await store.initialize();

    // Verify fallback resolves to InMemoryWorkflowPersistenceStore
    assert.ok((store as any).fallback);
  });

  await t.test('3. PostgresWorkflowPersistenceStore - Insert and Retrieve mapping', async () => {
    const store = new PostgresWorkflowPersistenceStore('postgresql://localhost/fake');
    const mockPool = new MockPgPool();
    (store as any).pool = mockPool;
    (store as any).isInitialized = true;

    const execution: WorkflowExecution = {
      executionId: 'exec-123',
      workflowId: 'flow-abc',
      workflowVersion: '1.0.0',
      status: 'RUNNING',
      currentStepId: 'step-1',
      variables: { tenantId: 'tenant-1', workspaceId: 'ws-1', data: 'hello' },
      completedSteps: {},
      errors: {},
      startTime: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Mock row returned for retrieval query
    mockPool.rows = [{
      execution_id: 'exec-123',
      workflow_id: 'flow-abc',
      workflow_version: '1.0.0',
      status: 'RUNNING',
      current_step_id: 'step-1',
      variables: { tenantId: 'tenant-1', workspaceId: 'ws-1', data: 'hello' },
      completed_steps: {},
      errors: {},
      started_at: execution.startTime,
      updated_at: execution.updatedAt
    }];

    // Mock queryHook to simulate INSERT (first SELECT yields 0 rows)
    mockPool.queryHook = (sql, params) => {
      if (sql.includes('SELECT version')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    };

    await store.saveExecution(execution);
    
    // Check that we queried version first and then INSERT
    assert.ok(mockPool.queries[0].sql.includes('SELECT version FROM workflow_executions'));
    assert.ok(mockPool.queries[1].sql.includes('INSERT INTO workflow_executions'));
    assert.strictEqual(mockPool.queries[1].params[0], 'exec-123');
    assert.strictEqual(mockPool.queries[1].params[8], 'tenant-1');
    assert.strictEqual(mockPool.queries[1].params[9], 'ws-1');

    // Retrieve
    mockPool.queryHook = undefined; // Return mockPool.rows
    const retrieved = await store.getExecution('exec-123', 'tenant-1', 'ws-1');
    assert.ok(retrieved);
    assert.strictEqual(retrieved.executionId, 'exec-123');
    assert.strictEqual(retrieved.status, 'RUNNING');
  });

  await t.test('4. Optimistic Concurrency version control protection', async () => {
    const store = new PostgresWorkflowPersistenceStore('postgresql://localhost/fake');
    const mockPool = new MockPgPool();
    (store as any).pool = mockPool;
    (store as any).isInitialized = true;

    const execution: WorkflowExecution = {
      executionId: 'exec-123',
      workflowId: 'flow-abc',
      workflowVersion: '1.0.0',
      status: 'RUNNING',
      currentStepId: 'step-1',
      variables: { tenantId: 'tenant-1', workspaceId: 'ws-1' },
      completedSteps: {},
      errors: {},
      startTime: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // First query: select version returns version = 5
    // Second query: update fails due to race conditions (rowCount = 0)
    mockPool.queryHook = (sql, params) => {
      if (sql.includes('SELECT version')) {
        return { rows: [{ version: 5 }], rowCount: 1 };
      }
      if (sql.includes('UPDATE')) {
        return { rows: [], rowCount: 0 }; // 0 rows updated means version mismatch/optimistic concurrency failure!
      }
      return { rows: [], rowCount: 0 };
    };

    await assert.rejects(async () => {
      await store.saveExecution(execution);
    }, /Optimistic concurrency violation/);
  });

  await t.test('5. Tenant and Workspace Isolation Scopes', async () => {
    const store = new PostgresWorkflowPersistenceStore('postgresql://localhost/fake');
    const mockPool = new MockPgPool();
    (store as any).pool = mockPool;
    (store as any).isInitialized = true;

    mockPool.rows = [];

    // Query must enforce tenant and workspace filters
    await store.getExecution('exec-999', 'tenant-isolated', 'ws-isolated');

    const selectQuery = mockPool.queries[0];
    assert.ok(selectQuery.sql.includes('tenant_id = $2'));
    assert.ok(selectQuery.sql.includes('workspace_id = $3'));
    assert.strictEqual(selectQuery.params[1], 'tenant-isolated');
    assert.strictEqual(selectQuery.params[2], 'ws-isolated');

    // Delete isolated scope
    await store.deleteExecution('exec-999', 'tenant-isolated', 'ws-isolated');
    const deleteQuery = mockPool.queries[1];
    assert.ok(deleteQuery.sql.includes('tenant_id = $2'));
    assert.ok(deleteQuery.sql.includes('workspace_id = $3'));
    assert.strictEqual(deleteQuery.params[1], 'tenant-isolated');
    assert.strictEqual(deleteQuery.params[2], 'ws-isolated');
  });

  await t.test('6. Secrets scrubbing redaction', async () => {
    const store = new PostgresWorkflowPersistenceStore('postgresql://localhost/fake');
    const mockPool = new MockPgPool();
    (store as any).pool = mockPool;
    (store as any).isInitialized = true;

    const execution: WorkflowExecution = {
      executionId: 'exec-sec',
      workflowId: 'flow-abc',
      workflowVersion: '1.0.0',
      status: 'RUNNING',
      currentStepId: 'step-1',
      variables: { 
        tenantId: 'tenant-1', 
        workspaceId: 'ws-1', 
        apiKey: 'sk-live-12345', 
        token: 'auth-jwt-token',
        nested: { password: 'plainpassword' }
      },
      completedSteps: {},
      errors: {},
      startTime: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    mockPool.queryHook = (sql, params) => {
      if (sql.includes('SELECT version')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    };

    await store.saveExecution(execution);

    // Verify parameters inserted had redacts
    const insertQuery = mockPool.queries[1];
    const variablesParam = JSON.parse(insertQuery.params[5]);
    
    assert.strictEqual(variablesParam.apiKey, '[REDACTED]');
    assert.strictEqual(variablesParam.token, '[REDACTED]');
    assert.strictEqual(variablesParam.nested.password, '[REDACTED]');
    assert.strictEqual(variablesParam.tenantId, 'tenant-1'); // safe keys remain unchanged
  });

  await t.test('7. Active write failures propagate (no silent fallback)', async () => {
    const store = new PostgresWorkflowPersistenceStore('postgresql://localhost/fake');
    const mockPool = new MockPgPool();
    (store as any).pool = mockPool;
    (store as any).isInitialized = true;

    // Simulate database offline / query failure
    mockPool.queryHook = () => {
      throw new Error('Neon database is read-only or unreachable');
    };

    const execution: WorkflowExecution = {
      executionId: 'exec-fail',
      workflowId: 'flow-abc',
      workflowVersion: '1.0.0',
      status: 'RUNNING',
      currentStepId: 'step-1',
      variables: {
        tenantId: 'tenant-test',
        workspaceId: 'workspace-test'
      },
      completedSteps: {},
      errors: {},
      startTime: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await assert.rejects(async () => {
      await store.saveExecution(execution);
    }, /Neon database is read-only or unreachable/);
  });

  Object.assign(process.env, originalEnv);
});
