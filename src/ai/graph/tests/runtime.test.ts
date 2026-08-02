import test from 'node:test';
import assert from 'node:assert';
import { 
  GraphRuntime,
  InMemoryGraphStorage,
  RelationshipRegistry,
  BFSTraversalStrategy,
  GraphQueryBuilder,
  GraphIndexer,
  featureFlags,
  KnowledgeNode,
  KnowledgeEdge
} from '../index';
import { MemoryRecord, MemoryType } from '../../memory/types';

test('Knowledge Graph Runtime Test Suite', async (t) => {

  const registry = new RelationshipRegistry();
  const storage = new InMemoryGraphStorage();
  const runtime = new GraphRuntime(storage, registry);

  const nodeA: KnowledgeNode = {
    id: 'node-a',
    label: 'Profile A',
    type: 'PROFILE',
    properties: { name: 'Alice', age: 30 },
    weight: 1.0,
    confidence: 1.0,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const nodeB: KnowledgeNode = {
    id: 'node-b',
    label: 'Preference B',
    type: 'PREFERENCE',
    properties: { color: 'blue' },
    weight: 0.8,
    confidence: 0.95,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const nodeC: KnowledgeNode = {
    id: 'node-c',
    label: 'Knowledge C',
    type: 'KNOWLEDGE',
    properties: { topic: 'AI' },
    weight: 0.5,
    confidence: 0.9,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await t.test('1. Node creation, updates, and deletion', async () => {
    await runtime.addNode(nodeA);
    await runtime.addNode(nodeB);

    const retrieved = await storage.getNode('node-a');
    assert.strictEqual(retrieved?.label, 'Profile A');
    assert.strictEqual(retrieved?.weight, 1.0);

    // Update node properties
    await runtime.updateNode('node-a', { name: 'Alice Revised', location: 'USA' });
    const updated = await storage.getNode('node-a');
    assert.strictEqual(updated?.properties.name, 'Alice Revised');
    assert.strictEqual(updated?.properties.location, 'USA');

    // Delete node
    await runtime.deleteNode('node-b');
    const deleted = await storage.getNode('node-b');
    assert.strictEqual(deleted, null);
  });

  await t.test('2. Relationship validation and Edge creation', async () => {
    // Add back Node B
    await runtime.addNode(nodeB);

    const edge: KnowledgeEdge = {
      id: 'edge-ab',
      source: 'node-a',
      target: 'node-b',
      type: 'PREFERS',
      properties: { since: '2026' },
      weight: 1.0,
      confidence: 1.0,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Add Edge should validate relationship type
    await runtime.addEdge(edge);
    const retrievedEdge = await storage.getEdge('edge-ab');
    assert.strictEqual(retrievedEdge?.type, 'PREFERS');
    assert.strictEqual(retrievedEdge?.source, 'node-a');

    // Invalid relationship type
    const invalidEdge: KnowledgeEdge = {
      ...edge,
      id: 'edge-invalid',
      type: 'SUPER_RELATION'
    };
    await assert.rejects(async () => {
      await runtime.addEdge(invalidEdge);
    });

    // Custom relationship registration
    registry.register('SUPER_RELATION');
    await runtime.addEdge(invalidEdge);
    const retrievedCustom = await storage.getEdge('edge-invalid');
    assert.strictEqual(retrievedCustom?.type, 'SUPER_RELATION');
  });

  await t.test('3. BFS shortest path traversal', async () => {
    // Build path: A -> B -> C
    await runtime.addNode(nodeC);

    const edgeBC: KnowledgeEdge = {
      id: 'edge-bc',
      source: 'node-b',
      target: 'node-c',
      type: 'RELATED_TO',
      properties: {},
      weight: 1.0,
      confidence: 1.0,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await runtime.addEdge(edgeBC);

    const path = await runtime.shortestPath('node-a', 'node-c');
    assert.deepStrictEqual(path, ['node-a', 'node-b', 'node-c']);
  });

  await t.test('4. Fluent query builder and graph search', async () => {
    const builder = new GraphQueryBuilder();
    const query = builder
      .filterNodeType('PROFILE')
      .hasProperty('location', 'USA')
      .matchesText('Alice')
      .limit(10)
      .build();

    assert.strictEqual(query.nodeType, 'PROFILE');
    assert.strictEqual(query.propertyFilters?.location, 'USA');
    assert.strictEqual(query.searchQuery, 'Alice');
    assert.strictEqual(query.limit, 10);

    const searchResults = await runtime.search(query);
    assert.strictEqual(searchResults.length, 1);
    assert.strictEqual(searchResults[0].id, 'node-a');
  });

  await t.test('5. GraphIndexer mapping of MemoryRecord references', async () => {
    // Clear storage
    const newStorage = new InMemoryGraphStorage();
    const newRuntime = new GraphRuntime(newStorage, registry);
    const indexer = new GraphIndexer(newRuntime);

    const memoryRecord: MemoryRecord = {
      id: 'mem-101',
      creatorId: 'user-1',
      content: 'This memory refers to target Node A.',
      tags: ['ai', 'agent'],
      type: MemoryType.KNOWLEDGE,
      importance: 7,
      source: 'user',
      confidence: 0.9,
      lastAccessed: new Date().toISOString(),
      accessCount: 1,
      metadata: {
        references: ['node-a'],
        belongsTo: 'node-c'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Index targets first to ensure they exist for constraints
    await newRuntime.addNode(nodeA);
    await newRuntime.addNode(nodeC);

    await indexer.indexRecord(memoryRecord);

    const indexedNode = await newStorage.getNode('mem-101');
    assert.strictEqual(indexedNode?.label, 'ai'); // first tag
    assert.strictEqual(indexedNode?.weight, 7); // record importance
    assert.strictEqual(indexedNode?.confidence, 0.9);

    // Verify edges were created automatically
    const edgeRef = await newStorage.getEdge('edge-mem-101-REFERENCES-node-a');
    assert.ok(edgeRef);
    assert.strictEqual(edgeRef.source, 'mem-101');
    assert.strictEqual(edgeRef.target, 'node-a');

    const edgeBelongs = await newStorage.getEdge('edge-mem-101-BELONGS_TO-node-c');
    assert.ok(edgeBelongs);
    assert.strictEqual(edgeBelongs.source, 'mem-101');
    assert.strictEqual(edgeBelongs.target, 'node-c');
  });

  await t.test('6. Feature flags backward compatibility', () => {
    assert.strictEqual(featureFlags.KNOWLEDGE_GRAPH, false);
    assert.strictEqual(featureFlags.GRAPH_INDEXING, false);
  });

});
