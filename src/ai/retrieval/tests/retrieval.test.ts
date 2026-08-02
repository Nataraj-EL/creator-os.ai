import test from 'node:test';
import assert from 'node:assert';
import { 
  DeterministicEmbeddingProvider, 
  InMemoryVectorStore, 
  RetrievalService, 
  WeightedHybridStrategy, 
  retrievalProviderRegistry, 
  vectorStoreRegistry, 
  retrievalFeatureFlags, 
  RetrievalLifecycleEvent
} from '../index';

test('AI Semantic Retrieval Engine Suite', async (t) => {

  const originalSem = retrievalFeatureFlags.SEMANTIC_RETRIEVAL;
  const originalHyb = retrievalFeatureFlags.HYBRID_RETRIEVAL;
  const originalEmb = retrievalFeatureFlags.EMBEDDINGS_ENABLED;

  t.beforeEach(() => {
    retrievalProviderRegistry.clear();
    vectorStoreRegistry.clear();

    const provider = new DeterministicEmbeddingProvider();
    const store = new InMemoryVectorStore();

    retrievalProviderRegistry.register(provider);
    vectorStoreRegistry.register(store);
  });

  t.afterEach(() => {
    retrievalFeatureFlags.SEMANTIC_RETRIEVAL = originalSem;
    retrievalFeatureFlags.HYBRID_RETRIEVAL = originalHyb;
    retrievalFeatureFlags.EMBEDDINGS_ENABLED = originalEmb;
    retrievalProviderRegistry.clear();
    vectorStoreRegistry.clear();
  });

  await t.test('1. Embedding Generator - builds deterministic 4D vectors', async () => {
    const provider = new DeterministicEmbeddingProvider();
    
    // Vector with style keyword
    const resStyle = await provider.embed('Define the tone style');
    assert.strictEqual(resStyle.dimension, 4);
    assert.strictEqual(resStyle.model, 'deterministic-4d');
    assert.deepStrictEqual(resStyle.vector, [1.0, 0.0, 0.0, 0.0]);

    // Vector with brand & preference keywords
    const resBrandPref = await provider.embed('Brand preferences');
    assert.strictEqual(resBrandPref.dimension, 4);
    // Norm of [0.0, 1.0, 1.0, 0.0] is sqrt(2), normalized is [0, 1/sqrt(2), 1/sqrt(2), 0]
    const val = 1.0 / Math.sqrt(2);
    assert.ok(Math.abs(resBrandPref.vector[1] - val) < 1e-5);
    assert.ok(Math.abs(resBrandPref.vector[2] - val) < 1e-5);
  });

  await t.test('2. Cosine Similarity - computes vector distance in memory', async () => {
    const store = new InMemoryVectorStore();
    
    // Store record 1: [1.0, 0.0, 0.0, 0.0]
    await store.store({
      id: 'rec-style',
      vector: [1.0, 0.0, 0.0, 0.0],
      metadata: { creatorId: 'user-777' }
    });

    // Store record 2: [0.0, 1.0, 0.0, 0.0]
    await store.store({
      id: 'rec-brand',
      vector: [0.0, 1.0, 0.0, 0.0],
      metadata: { creatorId: 'user-777' }
    });

    // Query exact match for style: [1.0, 0.0, 0.0, 0.0]
    const hitsExact = await store.query([1.0, 0.0, 0.0, 0.0], 5, { creatorId: 'user-777' });
    assert.strictEqual(hitsExact.length, 2);
    assert.strictEqual(hitsExact[0].record.id, 'rec-style');
    assert.strictEqual(hitsExact[0].similarity, 1.0); // Exact match similarity 1.0

    // Orthogonal match similarity 0.0
    assert.strictEqual(hitsExact[1].record.id, 'rec-brand');
    assert.strictEqual(hitsExact[1].similarity, 0.0);
  });

  await t.test('3. Metadata Filters - filters matches by context keys', async () => {
    const store = new InMemoryVectorStore();
    
    await store.store({
      id: 'rec-1',
      vector: [1.0, 0.0, 0.0, 0.0],
      metadata: { creatorId: 'user-777', section: 'profile' }
    });

    await store.store({
      id: 'rec-2',
      vector: [1.0, 0.0, 0.0, 0.0],
      metadata: { creatorId: 'user-888', section: 'profile' }
    });

    // Query with filter creatorId: user-777
    const hits1 = await store.query([1.0, 0.0, 0.0, 0.0], 5, { creatorId: 'user-777' });
    assert.strictEqual(hits1.length, 1);
    assert.strictEqual(hits1[0].record.id, 'rec-1');

    // Query with filter section: profile
    const hits2 = await store.query([1.0, 0.0, 0.0, 0.0], 5, { section: 'profile' });
    assert.strictEqual(hits2.length, 2);
  });

  await t.test('4. Pluggable Hybrid Strategies - ranks results by combined strategy weights', async () => {
    retrievalFeatureFlags.SEMANTIC_RETRIEVAL = true;
    retrievalFeatureFlags.HYBRID_RETRIEVAL = true;
    retrievalFeatureFlags.EMBEDDINGS_ENABLED = true;

    const store = vectorStoreRegistry.getStore()!;
    await store.store({
      id: 'rec-brand-content',
      vector: [0.0, 1.0, 0.0, 0.0],
      metadata: { creatorId: 'user-777', content: 'Our company brand guidelines.' }
    });

    await store.store({
      id: 'rec-brand-empty',
      vector: [0.0, 1.0, 0.0, 0.0],
      metadata: { creatorId: 'user-777', content: 'Guidelines document.' }
    });

    const service = new RetrievalService();
    
    // Execute hybrid query using custom strategy weights: 0.6 semantic, 0.4 keyword
    const strategy = new WeightedHybridStrategy(0.6, 0.4);
    const results = await service.hybridSearch({
      text: 'brand',
      creatorId: 'user-777',
      topK: 5
    }, strategy);

    assert.strictEqual(results.length, 2);
    
    // rec-brand-content matches 'brand' in content text -> keyword score 1.0
    // semantic similarity is 1.0 (both represent brand keyword)
    // combined score: 0.6 * 1.0 + 0.4 * 1.0 = 1.0
    assert.strictEqual(results[0].memoryId, 'rec-brand-content');
    assert.strictEqual(results[0].similarityScore, 1.0);
    assert.strictEqual(results[0].keywordScore, 1.0);
    assert.strictEqual(results[0].finalScore, 1.0);

    // rec-brand-empty semantic similarity is 1.0, but keyword score is 0.0
    // combined score: 0.6 * 1.0 + 0.4 * 0.0 = 0.6
    assert.strictEqual(results[1].memoryId, 'rec-brand-empty');
    assert.strictEqual(results[1].similarityScore, 1.0);
    assert.strictEqual(results[1].keywordScore, 0.0);
    assert.strictEqual(results[1].finalScore, 0.6);
  });

  await t.test('5. Lifecycle Events - notifies registered event listeners', async () => {
    retrievalFeatureFlags.SEMANTIC_RETRIEVAL = true;
    retrievalFeatureFlags.EMBEDDINGS_ENABLED = true;

    const service = new RetrievalService();
    const events: RetrievalLifecycleEvent[] = [];

    service.addListener((evt) => {
      events.push(evt);
    });

    await service.semanticSearch({
      text: 'style guidelines',
      creatorId: 'user-777'
    });

    assert.strictEqual(events.length, 4);
    assert.strictEqual(events[0].type, 'SEARCH_STARTED');
    assert.strictEqual(events[1].type, 'EMBEDDING_STARTED');
    assert.strictEqual(events[2].type, 'EMBEDDING_COMPLETED');
    assert.strictEqual(events[3].type, 'SEARCH_COMPLETED');
  });

});
