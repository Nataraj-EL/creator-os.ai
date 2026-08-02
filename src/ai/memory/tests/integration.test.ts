import test from 'node:test';
import assert from 'node:assert';
import { 
  MemoryRuntime, 
  MemoryProviderRegistry, 
  CreatorMemoryProvider,
  MemoryRepositoryFactory,
  MemoryType, 
  MemoryLifecycleEvent,
  memoryFeatureFlags,
  LocalStorageMemoryRepository
} from '../index';

test('AI Memory Persistent Provider Integration Suite', async (t) => {

  const originalEnabled = memoryFeatureFlags.MEMORY_ENABLED;
  const originalWrite = memoryFeatureFlags.MEMORY_WRITE;
  const originalRead = memoryFeatureFlags.MEMORY_READ;

  t.beforeEach(() => {
    // Clear factory and storage to prevent cross-contamination
    MemoryRepositoryFactory.clear();
    const repo = MemoryRepositoryFactory.getRepository();
    (repo as LocalStorageMemoryRepository).clear();
  });

  t.afterEach(() => {
    memoryFeatureFlags.MEMORY_ENABLED = originalEnabled;
    memoryFeatureFlags.MEMORY_WRITE = originalWrite;
    memoryFeatureFlags.MEMORY_READ = originalRead;
    MemoryRepositoryFactory.clear();
  });

  await t.test('1. Persistence & Retrieval - stores, updates, and deletes records', async () => {
    memoryFeatureFlags.MEMORY_ENABLED = true;
    memoryFeatureFlags.MEMORY_WRITE = true;
    memoryFeatureFlags.MEMORY_READ = true;

    const repository = MemoryRepositoryFactory.getRepository();
    const provider = new CreatorMemoryProvider(repository);
    const registry = new MemoryProviderRegistry();
    registry.register(provider);

    // Initialize with provider registry only to avoid double-saving records
    const runtime = new MemoryRuntime(registry);
    const context = { userId: 'creator-777' };

    // 1. Store
    const record = await runtime.store(context, 'Consistent tone preferences.', ['style'], MemoryType.BRAND);
    assert.ok(record);
    assert.strictEqual(record.content, 'Consistent tone preferences.');

    // Verify stored directly in repository
    const directRepoFind = await repository.findById(record.id);
    assert.ok(directRepoFind);
    assert.strictEqual(directRepoFind.content, 'Consistent tone preferences.');

    // 2. Retrieve
    const retrieved = await runtime.retrieve(context, record.id);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.content, 'Consistent tone preferences.');

    // 3. Update
    const updated = await runtime.update(context, record.id, {
      content: 'New consistent tone.'
    });
    assert.ok(updated);
    assert.strictEqual(updated.content, 'New consistent tone.');

    const checkDirect = await repository.findById(record.id);
    assert.strictEqual(checkDirect?.content, 'New consistent tone.');

    // 4. Delete
    const deleted = await runtime.delete(context, record.id);
    assert.strictEqual(deleted, true);

    const directCheckDeleted = await repository.findById(record.id);
    assert.strictEqual(directCheckDeleted, null);
  });

  await t.test('2. Access Metrics Tracking - updates count and lastAccessed timestamp on retrieve', async () => {
    memoryFeatureFlags.MEMORY_ENABLED = true;
    memoryFeatureFlags.MEMORY_WRITE = true;
    memoryFeatureFlags.MEMORY_READ = true;

    const repository = MemoryRepositoryFactory.getRepository();
    const provider = new CreatorMemoryProvider(repository);
    const registry = new MemoryProviderRegistry();
    registry.register(provider);

    const runtime = new MemoryRuntime(registry);
    const context = { userId: 'creator-777' };

    const record = await runtime.store(context, 'Track access details content.', ['access'], MemoryType.PREFERENCE);
    assert.ok(record);
    assert.strictEqual(record.accessCount, 0);

    const firstTime = record.lastAccessed;

    // Wait slightly to ensure timestamp differences are visible if processed sequentially
    await new Promise(r => setTimeout(r, 10));

    // Retrieve records
    const retrieved = await runtime.retrieve(context, record.id);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.accessCount, 1);
    assert.notStrictEqual(retrieved.lastAccessed, firstTime);
  });

  await t.test('3. Keyword Filtering & Flat Scoring - filters matches and returns 1.0 relevanceScore', async () => {
    memoryFeatureFlags.MEMORY_ENABLED = true;
    memoryFeatureFlags.MEMORY_WRITE = true;
    memoryFeatureFlags.MEMORY_READ = true;

    const repository = MemoryRepositoryFactory.getRepository();
    const provider = new CreatorMemoryProvider(repository);
    const registry = new MemoryProviderRegistry();
    registry.register(provider);

    const runtime = new MemoryRuntime(registry);
    const context = { userId: 'creator-777' };

    await runtime.store(context, 'This is standard knowledge input.', ['tech'], MemoryType.KNOWLEDGE);
    await runtime.store(context, 'This is standard profile input.', ['tech'], MemoryType.PROFILE);

    // Search by text keyword
    const searchResults = await runtime.search(context, {
      text: 'knowledge'
    });

    assert.strictEqual(searchResults.length, 1);
    assert.strictEqual(searchResults[0].content, 'This is standard knowledge input.');
    assert.strictEqual(searchResults[0].relevanceScore, 1.0); // Flat score as requested
  });

  await t.test('4. Trace Auditing - logs and records retrieved IDs in lifecycle search events', async () => {
    memoryFeatureFlags.MEMORY_ENABLED = true;
    memoryFeatureFlags.MEMORY_WRITE = true;
    memoryFeatureFlags.MEMORY_READ = true;

    const repository = MemoryRepositoryFactory.getRepository();
    const provider = new CreatorMemoryProvider(repository);
    const registry = new MemoryProviderRegistry();
    registry.register(provider);

    const runtime = new MemoryRuntime(registry);
    const context = { userId: 'creator-777' };

    const events: MemoryLifecycleEvent[] = [];
    runtime.addListener((evt) => {
      events.push(evt);
    });

    const record = await runtime.store(context, 'Trace audit test data.', ['trace'], MemoryType.BRAND);
    assert.ok(record);

    await runtime.search(context, { text: 'audit' });

    // Look for SEARCH lifecycle event
    const searchEvt = events.find(e => e.type === 'SEARCH');
    assert.ok(searchEvt);
    assert.strictEqual(searchEvt.details.resultsCount, 1);
    assert.deepStrictEqual(searchEvt.details.retrievedIds, [record.id]); // trace metadata ID check!
  });

  await t.test('5. Feature Flags - asserts write/read blocks', async () => {
    // 1. Write block
    memoryFeatureFlags.MEMORY_ENABLED = true;
    memoryFeatureFlags.MEMORY_WRITE = false;
    memoryFeatureFlags.MEMORY_READ = true;

    const repository = MemoryRepositoryFactory.getRepository();
    const provider = new CreatorMemoryProvider(repository);
    const registry = new MemoryProviderRegistry();
    registry.register(provider);

    const runtime = new MemoryRuntime(registry);
    const context = { userId: 'creator-777' };

    const record = await runtime.store(context, 'Bypassed data.', ['style'], MemoryType.BRAND);
    assert.strictEqual(record, null);

    // 2. Read block
    memoryFeatureFlags.MEMORY_WRITE = true;
    memoryFeatureFlags.MEMORY_READ = false;

    const record2 = await runtime.store(context, 'Saved data.', ['style'], MemoryType.BRAND);
    assert.ok(record2);

    const retrieved = await runtime.retrieve(context, record2.id);
    assert.strictEqual(retrieved, null);
  });
});
