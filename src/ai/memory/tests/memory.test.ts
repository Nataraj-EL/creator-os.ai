import test from 'node:test';
import assert from 'node:assert';
import { 
  MemoryRuntime, 
  MemoryProviderRegistry, 
  MemoryProvider, 
  MemoryRecord, 
  MemoryQuery, 
  MemoryType, 
  MemorySearchStrategy, 
  memoryFeatureFlags,
  MemoryLifecycleEvent
} from '../index';

// Simple in-memory provider to enable functional runtime testing
class MockInMemoryMemoryProvider implements MemoryProvider {
  public name = 'MockInMemory';
  public version = '1.0.0';
  public supportedOperations = ['store', 'retrieve', 'update', 'delete', 'search'];
  public records = new Map<string, MemoryRecord>();

  public async store(record: MemoryRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  public async retrieve(id: string): Promise<MemoryRecord | null> {
    return this.records.get(id) || null;
  }

  public async update(record: MemoryRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  public async delete(id: string): Promise<void> {
    this.records.delete(id);
  }

  public async search(query: MemoryQuery): Promise<MemoryRecord[]> {
    const all = Array.from(this.records.values());
    return all.filter(r => {
      if (r.creatorId !== query.creatorId) return false;
      if (query.tags && query.tags.length > 0) {
        if (!query.tags.every(t => r.tags.includes(t))) return false;
      }
      if (query.text) {
        if (!r.content.toLowerCase().includes(query.text.toLowerCase())) return false;
      }
      return true;
    });
  }
}

test('AI Memory Runtime Suite', async (t) => {
  
  // Track original feature flags state
  const originalEnabled = memoryFeatureFlags.MEMORY_ENABLED;
  const originalWrite = memoryFeatureFlags.MEMORY_WRITE;
  const originalRead = memoryFeatureFlags.MEMORY_READ;

  t.afterEach(() => {
    memoryFeatureFlags.MEMORY_ENABLED = originalEnabled;
    memoryFeatureFlags.MEMORY_WRITE = originalWrite;
    memoryFeatureFlags.MEMORY_READ = originalRead;
  });

  await t.test('1. Provider Registration - loads provider and retrieves by name', () => {
    const registry = new MemoryProviderRegistry();
    const provider = new MockInMemoryMemoryProvider();

    registry.register(provider);
    
    assert.strictEqual(registry.list().length, 1);
    assert.strictEqual(registry.get('MockInMemory'), provider);
    assert.strictEqual(registry.defaultProvider(), provider);
  });

  await t.test('2. Feature Flags - blocks operations when disabled', async () => {
    memoryFeatureFlags.MEMORY_ENABLED = false;

    const registry = new MemoryProviderRegistry();
    const provider = new MockInMemoryMemoryProvider();
    registry.register(provider);

    const runtime = new MemoryRuntime(registry);
    const context = { userId: 'creator-abc' };

    const record = await runtime.store(context, 'Sample brand info', ['brand'], MemoryType.BRAND);
    assert.strictEqual(record, null);
    assert.strictEqual(provider.records.size, 0);
  });

  await t.test('3. Operations Flow - store, retrieve, update, delete, search and relevance rank', async () => {
    // Enable flags
    memoryFeatureFlags.MEMORY_ENABLED = true;
    memoryFeatureFlags.MEMORY_WRITE = true;
    memoryFeatureFlags.MEMORY_READ = true;

    const registry = new MemoryProviderRegistry();
    const provider = new MockInMemoryMemoryProvider();
    registry.register(provider);

    const runtime = new MemoryRuntime(registry);
    const context = { userId: 'creator-123', requestId: 'req-987' };

    // 1. Store
    const record = await runtime.store(context, 'This is a youtube creator preference content.', ['yt', 'preference'], MemoryType.PREFERENCE, {
      importance: 8,
      confidence: 0.95
    });

    assert.ok(record);
    assert.strictEqual(record.content, 'This is a youtube creator preference content.');
    assert.strictEqual(record.creatorId, 'creator-123');
    assert.strictEqual(record.importance, 8);
    assert.strictEqual(record.confidence, 0.95);
    assert.strictEqual(record.accessCount, 0);

    // 2. Retrieve
    const retrieved = await runtime.retrieve(context, record.id);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.id, record.id);
    assert.strictEqual(retrieved.accessCount, 1); // Incremented

    // 3. Update
    const updated = await runtime.update(context, record.id, {
      content: 'Updated content.',
      importance: 9
    });
    assert.ok(updated);
    assert.strictEqual(updated.content, 'Updated content.');
    assert.strictEqual(updated.importance, 9);

    // 4. Search and Relevance Rank
    // Let's add another memory with a different relevance score to test relevance sorting
    const record2 = await runtime.store(context, 'Another preference.', ['preference'], MemoryType.PREFERENCE);
    assert.ok(record2);

    // Manually set relevance scores on the mock provider records to test runtime sorting
    provider.records.get(record.id)!.relevanceScore = 0.5;
    provider.records.get(record2.id)!.relevanceScore = 0.9;

    const searchResults = await runtime.search(context, {
      tags: ['preference'],
      strategy: MemorySearchStrategy.HYBRID
    });

    assert.strictEqual(searchResults.length, 2);
    // Verified sorting: relevanceScore 0.9 comes before 0.5
    assert.strictEqual(searchResults[0].id, record2.id);
    assert.strictEqual(searchResults[1].id, record.id);

    // 5. Delete
    const deleted = await runtime.delete(context, record.id);
    assert.strictEqual(deleted, true);

    const checkRetrieved = await runtime.retrieve(context, record.id);
    assert.strictEqual(checkRetrieved, null);
  });

  await t.test('4. Lifecycle Events - notifies registered event listeners', async () => {
    memoryFeatureFlags.MEMORY_ENABLED = true;
    memoryFeatureFlags.MEMORY_WRITE = true;

    const registry = new MemoryProviderRegistry();
    const provider = new MockInMemoryMemoryProvider();
    registry.register(provider);

    const runtime = new MemoryRuntime(registry);
    const context = { userId: 'creator-xyz' };

    const events: MemoryLifecycleEvent[] = [];
    runtime.addListener((evt) => {
      events.push(evt);
    });

    await runtime.store(context, 'Some content', ['tag'], MemoryType.BRAND);

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'STORE');
    assert.strictEqual(events[0].context.userId, 'creator-xyz');
    assert.strictEqual(events[0].details.type, MemoryType.BRAND);
  });

});
