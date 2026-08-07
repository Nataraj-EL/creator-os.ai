import test from 'node:test';
import assert from 'node:assert';
import { memoryFeatureFlags } from '../config/featureFlags';
import { PgVectorMemoryRepository } from '../storage/pgVectorRepository';
import { MockEmbeddingProvider, getEmbeddingProvider } from '../embeddings';
import { MemoryRepositoryFactory } from '../storage/repositoryFactory';
import { MemoryRecord, MemoryType } from '../types';

test('AI Vector Memory Test Suite', async (t) => {

  const originalEnv = { ...process.env };

  const clearEnv = () => {
    delete process.env.DATABASE_URL;
  };

  await t.test('1. Feature flag defaults', () => {
    assert.strictEqual(memoryFeatureFlags.VECTOR_MEMORY, false);
    assert.strictEqual(memoryFeatureFlags.PGVECTOR_RETRIEVAL, false);
    assert.strictEqual(memoryFeatureFlags.EMBEDDING_PROVIDER, 'mock');
  });

  await t.test('2. Missing credentials / disabled fallback', () => {
    clearEnv();
    memoryFeatureFlags.VECTOR_MEMORY = false;
    MemoryRepositoryFactory.clear();

    const repo = MemoryRepositoryFactory.getRepository();
    assert.strictEqual(repo.constructor.name, 'LocalStorageMemoryRepository');
    MemoryRepositoryFactory.clear();
  });

  await t.test('3. Embedding generation and configuration dimensions', async () => {
    const provider768 = getEmbeddingProvider(undefined, 768);
    const vector768 = await provider768.embed('Hello world');
    assert.strictEqual(vector768.length, 768);

    const provider1536 = getEmbeddingProvider(undefined, 1536);
    const vector1536 = await provider1536.embed('Hello world');
    assert.strictEqual(vector1536.length, 1536);
  });

  await t.test('4. PgVectorMemoryRepository - Insert, Update, and Delete mapping', async () => {
    const mockProvider = new MockEmbeddingProvider(768);
    const repository = new PgVectorMemoryRepository('postgresql://localhost/fake', mockProvider);

    const queriesExecuted: Array<{ sql: string; params: any[] }> = [];

    (repository as any).pool.query = async (sql: string, params: any[]) => {
      queriesExecuted.push({ sql, params });
      return { rows: [] };
    };

    const record: MemoryRecord = {
      id: 'mem-111',
      creatorId: 'user-222',
      content: 'This is test content',
      tags: ['tag1'],
      type: MemoryType.BRAND,
      importance: 5,
      confidence: 1.0,
      source: 'user',
      lastAccessed: new Date().toISOString(),
      accessCount: 0,
      metadata: { tenantId: 'tenant-aaa', workspaceId: 'workspace-bbb' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await repository.save(record);
    assert.strictEqual(queriesExecuted.length, 1);
    assert.ok(queriesExecuted[0].sql.includes('INSERT INTO ai_memories'));
    assert.strictEqual(queriesExecuted[0].params[0], 'mem-111');
    assert.strictEqual(queriesExecuted[0].params[2], 'tenant-aaa');
    assert.strictEqual(queriesExecuted[0].params[3], 'workspace-bbb');

    await repository.update(record);
    assert.strictEqual(queriesExecuted.length, 2);
    assert.ok(queriesExecuted[1].sql.includes('UPDATE ai_memories'));

    await repository.deleteById('mem-111');
    assert.strictEqual(queriesExecuted.length, 3);
    assert.ok(queriesExecuted[2].sql.includes('DELETE FROM ai_memories WHERE id = $1'));
    assert.strictEqual(queriesExecuted[2].params[0], 'mem-111');

    await repository.dispose();
  });

  await t.test('5. Multi-Tenant and Workspace Isolation scoped search query', async () => {
    const mockProvider = new MockEmbeddingProvider(768);
    const repository = new PgVectorMemoryRepository('postgresql://localhost/fake', mockProvider);

    let sqlQuery = '';
    let sqlParams: any[] = [];

    (repository as any).pool.query = async (sql: string, params: any[]) => {
      sqlQuery = sql;
      sqlParams = params;
      return {
        rows: [
          {
            id: 'mem-123',
            creator_id: 'user-777',
            content: 'Found memory content',
            tags: ['test'],
            type: 'BRAND',
            similarity: 0.92
          }
        ]
      };
    };

    const results = await repository.query({
      creatorId: 'user-777',
      text: 'search prompt key',
      metadataFilters: {
        tenantId: 'tenant-isolated',
        workspaceId: 'workspace-isolated'
      }
    });

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'mem-123');
    assert.strictEqual(results[0].relevanceScore, 0.92);

    assert.ok(sqlQuery.includes('tenant_id = $2'));
    assert.ok(sqlQuery.includes('workspace_id = $3'));
    assert.strictEqual(sqlParams[1], 'tenant-isolated');
    assert.strictEqual(sqlParams[2], 'workspace-isolated');

    await repository.dispose();
  });

  await t.test('6. Connection failure handles fail-open fallback', async () => {
    const mockProvider = new MockEmbeddingProvider(768);
    const repository = new PgVectorMemoryRepository('postgresql://localhost/fake-crashed', mockProvider);

    // Force query to reject simulating database connection failures
    (repository as any).pool.query = async () => {
      throw new Error('Neon database unreachable');
    };

    const record: MemoryRecord = {
      id: 'mem-999',
      creatorId: 'user-777',
      content: 'Resilient text content',
      tags: [],
      type: MemoryType.BRAND,
      importance: 5,
      confidence: 1.0,
      source: 'user',
      lastAccessed: new Date().toISOString(),
      accessCount: 0,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save must not crash
    await assert.doesNotReject(async () => {
      await repository.save(record);
    });

    // query should return our saved fallback record
    const results = await repository.query({
      creatorId: 'user-777',
      text: 'Resilient'
    });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'mem-999');

    await repository.dispose();
  });

  Object.assign(process.env, originalEnv);
});
