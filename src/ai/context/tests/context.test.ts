import test from 'node:test';
import assert from 'node:assert';
import { 
  ContextAssemblyRuntime, 
  contextRankingStrategyRegistry,
  ContextStrategy, 
  TokenBudgetCompressor, 
  contextFeatureFlags,
  ContextLifecycleEvent,
  ContextBlock
} from '../index';
import { MemoryRecord, MemoryType } from '../../memory/types';

// Mock candidate memories list
const MOCK_MEMORIES: MemoryRecord[] = [
  {
    id: 'mem-1',
    creatorId: 'user-123',
    content: 'A semantic similarity match content.', // ~9 tokens estimate
    tags: ['tech'],
    type: MemoryType.BRAND,
    importance: 5,
    source: 'user',
    confidence: 0.9,
    lastAccessed: new Date().toISOString(),
    accessCount: 0,
    relevanceScore: 0.95, // High semantic relevance
    createdAt: '2026-08-01T00:00:00.000Z', // Old
    updatedAt: '2026-08-01T00:00:00.000Z',
    metadata: {}
  },
  {
    id: 'mem-2',
    creatorId: 'user-123',
    content: 'Highly important brand values.', // ~8 tokens estimate
    tags: ['tech'],
    type: MemoryType.BRAND,
    importance: 10, // High importance
    source: 'user',
    confidence: 0.95,
    lastAccessed: new Date().toISOString(),
    accessCount: 0,
    relevanceScore: 0.6,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    metadata: {}
  },
  {
    id: 'mem-3',
    creatorId: 'user-123',
    content: 'Very recent conversations.', // ~7 tokens estimate
    tags: ['tech'],
    type: MemoryType.BRAND,
    importance: 4,
    source: 'user',
    confidence: 0.9,
    lastAccessed: new Date().toISOString(),
    accessCount: 0,
    relevanceScore: 0.5,
    createdAt: '2026-08-02T06:00:00.000Z', // Newest
    updatedAt: '2026-08-02T06:00:00.000Z',
    metadata: {}
  }
];

// Mock MemoryService search provider
const mockMemoryService: any = {
  search: async (context: any, query: any) => {
    // Return memories
    return MOCK_MEMORIES;
  }
};

test('AI Context Assembly Engine Suite', async (t) => {

  const originalEnabled = contextFeatureFlags.CONTEXT_ENABLED;
  const originalRanking = contextFeatureFlags.CONTEXT_RANKING;
  const originalComp = contextFeatureFlags.CONTEXT_COMPRESSION;

  t.afterEach(() => {
    contextFeatureFlags.CONTEXT_ENABLED = originalEnabled;
    contextFeatureFlags.CONTEXT_RANKING = originalRanking;
    contextFeatureFlags.CONTEXT_COMPRESSION = originalComp;
  });

  await t.test('1. Feature Flag Disabled - should return empty result', async () => {
    contextFeatureFlags.CONTEXT_ENABLED = false;

    const runtime = new ContextAssemblyRuntime(mockMemoryService);
    const res = await runtime.assemble({
      userId: 'user-123',
      prompt: 'Write script'
    });

    assert.strictEqual(res.blocks.length, 0);
    assert.strictEqual(res.totalTokens, 0);
  });

  await t.test('2. Deduplication - drops duplicate block IDs or content', async () => {
    contextFeatureFlags.CONTEXT_ENABLED = true;

    // MemoryService returning duplicate ID and duplicate content
    const mockMemServiceDup: any = {
      search: async () => [
        MOCK_MEMORIES[0],
        MOCK_MEMORIES[0], // Duplicate ID
        {
          ...MOCK_MEMORIES[1],
          id: 'mem-different-id',
          content: MOCK_MEMORIES[0].content // Duplicate content
        }
      ]
    };

    const runtime = new ContextAssemblyRuntime(mockMemServiceDup);
    const res = await runtime.assemble({
      userId: 'user-123',
      prompt: 'Write script'
    });

    // Both duplicates should be dropped, leaving exactly 1 unique block
    assert.strictEqual(res.blocks.length, 1);
    assert.strictEqual(res.blocks[0].id, 'mem-1');
  });

  await t.test('3. Ranking Strategies - Balanced, Recency, Importance, and Semantic First sorting', async () => {
    contextFeatureFlags.CONTEXT_ENABLED = true;
    contextFeatureFlags.CONTEXT_RANKING = true;

    const runtime = new ContextAssemblyRuntime(mockMemoryService);

    // 1. Semantic First Strategy
    const resSemantic = await runtime.assemble({
      userId: 'user-123',
      prompt: 'test',
      strategy: ContextStrategy.SEMANTIC_FIRST
    });
    // mem-1 has highest relevanceScore (0.95)
    assert.strictEqual(resSemantic.blocks[0].id, 'mem-1');
    assert.ok(resSemantic.blocks[0].selectionReason?.includes('Semantic First'));

    // 2. Importance First Strategy
    const resImportance = await runtime.assemble({
      userId: 'user-123',
      prompt: 'test',
      strategy: ContextStrategy.IMPORTANCE_FIRST
    });
    // mem-2 has highest importance (10)
    assert.strictEqual(resImportance.blocks[0].id, 'mem-2');
    assert.ok(resImportance.blocks[0].selectionReason?.includes('Importance First'));

    // 3. Recency First Strategy
    const resRecency = await runtime.assemble({
      userId: 'user-123',
      prompt: 'test',
      strategy: ContextStrategy.RECENCY_FIRST
    });
    // mem-3 is the newest record
    assert.strictEqual(resRecency.blocks[0].id, 'mem-3');
    assert.ok(resRecency.blocks[0].selectionReason?.includes('Recency First'));
  });

  await t.test('4. Token Budget & Extensible Compression - budget enforces truncations', async () => {
    contextFeatureFlags.CONTEXT_ENABLED = true;
    contextFeatureFlags.CONTEXT_RANKING = true;
    contextFeatureFlags.CONTEXT_COMPRESSION = true;

    const runtime = new ContextAssemblyRuntime(mockMemoryService);

    // Prompt estimate:
    // mem-1: content length 36 character -> 9 tokens
    // mem-2: content length 30 character -> 8 tokens
    // mem-3: content length 26 character -> 7 tokens
    
    // Set budget to 10 tokens. Under Semantic First:
    // Ranked list: mem-1 (9 tokens), mem-2 (8 tokens), mem-3 (7 tokens)
    // Accumulation:
    // mem-1: 9 tokens (fits <= 10)
    // mem-2: 9 + 8 = 17 (exceeds 10, dropped)
    // mem-3: 9 + 7 = 16 (exceeds 10, dropped)
    // Final result should have exactly 1 block (mem-1)
    const res = await runtime.assemble({
      userId: 'user-123',
      prompt: 'test',
      strategy: ContextStrategy.SEMANTIC_FIRST,
      tokenBudget: 10
    });

    assert.strictEqual(res.blocks.length, 1);
    assert.strictEqual(res.blocks[0].id, 'mem-1');
    assert.strictEqual(res.totalTokens, 9);

    // Extensible Compression: inject custom Compressor that overrides budget truncation
    const customCompressor = {
      name: 'CustomDoubleCompressor',
      compress: (blocks: ContextBlock[], budget: number) => {
        // Simple mock returns only first two blocks regardless of tokenCount
        return blocks.slice(0, 2);
      }
    };
    const runtimeCustom = new ContextAssemblyRuntime(mockMemoryService, undefined, customCompressor);
    const resCustom = await runtimeCustom.assemble({
      userId: 'user-123',
      prompt: 'test',
      strategy: ContextStrategy.SEMANTIC_FIRST,
      tokenBudget: 10
    });

    assert.strictEqual(resCustom.blocks.length, 2);
    assert.strictEqual(resCustom.blocks[0].id, 'mem-1');
    assert.strictEqual(resCustom.blocks[1].id, 'mem-2');
  });

  await t.test('5. Lifecycle Events - logs assembly started, ranked, compressed, and completed events', async () => {
    contextFeatureFlags.CONTEXT_ENABLED = true;
    contextFeatureFlags.CONTEXT_RANKING = true;
    contextFeatureFlags.CONTEXT_COMPRESSION = true;

    const runtime = new ContextAssemblyRuntime(mockMemoryService);
    const events: ContextLifecycleEvent[] = [];
    runtime.addListener((evt) => {
      events.push(evt);
    });

    await runtime.assemble({
      userId: 'user-123',
      prompt: 'test'
    });

    assert.strictEqual(events.length, 5);
    assert.strictEqual(events[0].type, 'ASSEMBLY_STARTED');
    assert.strictEqual(events[1].type, 'RETRIEVAL_COMPLETED');
    assert.strictEqual(events[2].type, 'RANKING_COMPLETED');
    assert.strictEqual(events[3].type, 'COMPRESSION_COMPLETED');
    assert.strictEqual(events[4].type, 'ASSEMBLY_COMPLETED');
  });
});
