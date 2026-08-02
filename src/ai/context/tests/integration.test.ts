import test from 'node:test';
import assert from 'node:assert';
import { ContextAssemblyRuntime } from '../services';
import { RetrievalAdapter } from '../services/retrievalAdapter';
import { 
  RetrievalService, 
  InMemoryVectorStore, 
  DeterministicEmbeddingProvider, 
  retrievalProviderRegistry, 
  vectorStoreRegistry, 
  retrievalFeatureFlags 
} from '../../retrieval';
import { contextFeatureFlags, ContextStrategy } from '../index';
import { MemoryRecord, MemoryType } from '../../memory/types';

// Mock MemoryService tracking query statistics
class MockMemoryService {
  public searchCount = 0;
  public retrieveCount = 0;
  public records: MemoryRecord[] = [];

  public async search(context: any, query: any): Promise<MemoryRecord[]> {
    this.searchCount++;
    return this.records;
  }

  public async retrieve(context: any, id: string): Promise<MemoryRecord | null> {
    this.retrieveCount++;
    return this.records.find(r => r.id === id) || null;
  }

  public clearCounts() {
    this.searchCount = 0;
    this.retrieveCount = 0;
  }
}

test('AI Semantic Context Retrieval Integration Suite', async (t) => {
  const originalCtxEnabled = contextFeatureFlags.CONTEXT_ENABLED;
  const originalCtxRanking = contextFeatureFlags.CONTEXT_RANKING;
  
  const originalSemRetrieval = retrievalFeatureFlags.SEMANTIC_RETRIEVAL;
  const originalHybRetrieval = retrievalFeatureFlags.HYBRID_RETRIEVAL;
  const originalEmbEnabled = retrievalFeatureFlags.EMBEDDINGS_ENABLED;

  const mockMemory = new MockMemoryService();
  const vectorStore = new InMemoryVectorStore();
  const embeddingProvider = new DeterministicEmbeddingProvider();

  // Test setup data
  const testRecord: MemoryRecord = {
    id: 'mem-style-101',
    creatorId: 'creator-777',
    content: 'Creator prefers detailed tech style content.',
    tags: ['tech', 'style'],
    type: MemoryType.PREFERENCE,
    importance: 8,
    source: 'user',
    confidence: 0.9,
    lastAccessed: new Date().toISOString(),
    accessCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {}
  };

  t.beforeEach(async () => {
    retrievalProviderRegistry.clear();
    vectorStoreRegistry.clear();

    retrievalProviderRegistry.register(embeddingProvider);
    vectorStoreRegistry.register(vectorStore);

    // Save mock memory record to vector store with hydrated memoryRecord nested metadata
    await vectorStore.store({
      id: testRecord.id,
      vector: [1.0, 0.0, 0.0, 0.0], // Matches style query embedding
      metadata: {
        creatorId: testRecord.creatorId,
        content: testRecord.content,
        memoryRecord: testRecord
      }
    });

    mockMemory.records = [testRecord];
    mockMemory.clearCounts();

    contextFeatureFlags.CONTEXT_ENABLED = true;
    contextFeatureFlags.CONTEXT_RANKING = false;
  });

  t.afterEach(() => {
    contextFeatureFlags.CONTEXT_ENABLED = originalCtxEnabled;
    contextFeatureFlags.CONTEXT_RANKING = originalCtxRanking;

    retrievalFeatureFlags.SEMANTIC_RETRIEVAL = originalSemRetrieval;
    retrievalFeatureFlags.HYBRID_RETRIEVAL = originalHybRetrieval;
    retrievalFeatureFlags.EMBEDDINGS_ENABLED = originalEmbEnabled;

    retrievalProviderRegistry.clear();
    vectorStoreRegistry.clear();
  });

  await t.test('1. N+1 Retrieval Prevention - asserts exactly zero retrieve database queries', async () => {
    retrievalFeatureFlags.SEMANTIC_RETRIEVAL = true;
    retrievalFeatureFlags.EMBEDDINGS_ENABLED = true;

    const retrievalService = new RetrievalService();
    const runtime = new ContextAssemblyRuntime(mockMemory as any, undefined, undefined, retrievalService);

    const result = await runtime.assemble({
      userId: 'creator-777',
      prompt: 'Detailed style guide'
    });

    assert.strictEqual(result.blocks.length, 1);
    assert.strictEqual(result.blocks[0].id, testRecord.id);
    assert.strictEqual(result.blocks[0].content, testRecord.content);

    // Assert NO database retrieve calls were executed for result records
    assert.strictEqual(mockMemory.retrieveCount, 0);
  });

  await t.test('2. Retrieval Adapter - maps RetrievalResults to ContextBlocks correctly', () => {
    const results = [
      {
        memoryId: 'mem-99',
        similarityScore: 0.85,
        keywordScore: 0.5,
        finalScore: 0.9,
        retrievalReason: 'Custom hybrid match reason.',
        metadata: {
          provider: 'InMemoryVectorStore',
          strategy: 'hybrid',
          embeddingVersion: '1.0.0',
          latency: 5
        },
        memoryRecord: testRecord
      }
    ];

    const blocks = RetrievalAdapter.mapToContextBlocks(results);
    assert.strictEqual(blocks.length, 1);
    
    const block = blocks[0];
    assert.strictEqual(block.id, 'mem-99');
    assert.strictEqual(block.content, testRecord.content);
    assert.strictEqual(block.relevanceScore, 0.9);
    assert.strictEqual(block.importance, testRecord.importance);
    assert.strictEqual(block.selectionReason, 'Custom hybrid match reason.');
    assert.strictEqual(block.metadata.retrieval.provider, 'InMemoryVectorStore');
  });

  await t.test('3. Semantic Integration Path - retrieves candidates semantically when flags are active', async () => {
    retrievalFeatureFlags.SEMANTIC_RETRIEVAL = true;
    retrievalFeatureFlags.EMBEDDINGS_ENABLED = true;

    const retrievalService = new RetrievalService();
    const runtime = new ContextAssemblyRuntime(mockMemory as any, undefined, undefined, retrievalService);

    const result = await runtime.assemble({
      userId: 'creator-777',
      prompt: 'Define brand style'
    });

    assert.strictEqual(result.blocks.length, 1);
    assert.strictEqual(result.blocks[0].id, testRecord.id);
    assert.strictEqual(mockMemory.searchCount, 0); // Bypasses keyword search
  });

  await t.test('4. Hybrid Integration Path - combines semantic and keyword queries', async () => {
    retrievalFeatureFlags.SEMANTIC_RETRIEVAL = true;
    retrievalFeatureFlags.HYBRID_RETRIEVAL = true;
    retrievalFeatureFlags.EMBEDDINGS_ENABLED = true;

    const retrievalService = new RetrievalService();
    const runtime = new ContextAssemblyRuntime(mockMemory as any, undefined, undefined, retrievalService);

    const result = await runtime.assemble({
      userId: 'creator-777',
      prompt: 'Detailed tech style'
    });

    assert.strictEqual(result.blocks.length, 1);
    // Combined finalScore is 0.5 * 1.0 (semantic) + 0.5 * 1.0 (keyword match) = 1.0
    assert.strictEqual(result.blocks[0].relevanceScore, 1.0);
  });

  await t.test('5. Keyword Fallback - falls back when SEMANTIC_RETRIEVAL flag is off', async () => {
    retrievalFeatureFlags.SEMANTIC_RETRIEVAL = false;

    const retrievalService = new RetrievalService();
    const runtime = new ContextAssemblyRuntime(mockMemory as any, undefined, undefined, retrievalService);

    const result = await runtime.assemble({
      userId: 'creator-777',
      prompt: 'Define brand style'
    });

    assert.strictEqual(result.blocks.length, 1);
    assert.strictEqual(mockMemory.searchCount, 1); // Executes fallback keyword search
  });

  await t.test('6. Fail-Open Path - fallback to keyword search if semantic search throws', async () => {
    retrievalFeatureFlags.SEMANTIC_RETRIEVAL = true;
    retrievalFeatureFlags.EMBEDDINGS_ENABLED = true;

    const retrievalService = new RetrievalService();
    // Simulate error by stubbing semanticSearch to throw
    retrievalService.semanticSearch = async () => {
      throw new Error("Semantic retrieval crashed.");
    };

    const runtime = new ContextAssemblyRuntime(mockMemory as any, undefined, undefined, retrievalService);

    const result = await runtime.assemble({
      userId: 'creator-777',
      prompt: 'Define brand style'
    });

    assert.strictEqual(result.blocks.length, 1);
    assert.strictEqual(mockMemory.searchCount, 1); // Graceful fallback to keyword search
  });

  await t.test('7. Backward Compatibility - constructs cleanly without RetrievalSearchService dependencies', async () => {
    // Call constructor with only MemoryService arguments
    const runtime = new ContextAssemblyRuntime(mockMemory as any);
    
    const result = await runtime.assemble({
      userId: 'creator-777',
      prompt: 'Define brand style'
    });

    assert.strictEqual(result.blocks.length, 1);
    assert.strictEqual(mockMemory.searchCount, 1);
  });

});
