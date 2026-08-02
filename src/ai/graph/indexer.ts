import { KnowledgeNode, KnowledgeEdge } from './types';
import { GraphRuntime } from './runtime';
import { MemoryRecord } from '../memory/types';
import { featureFlags } from './config/featureFlags';

export class GraphIndexer {
  constructor(private runtime: GraphRuntime) {}

  public async indexRecord(record: MemoryRecord): Promise<void> {
    const label = record.tags.length > 0 ? record.tags[0] : `Memory ${record.id}`;
    
    const node: KnowledgeNode = {
      id: record.id,
      label,
      type: record.type,
      properties: {
        content: record.content,
        tags: record.tags,
        ...record.metadata
      },
      weight: record.importance || 1.0,
      confidence: record.confidence || 1.0,
      version: record.metadata.version || '1.0.0',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };

    // Add or update node
    await this.runtime.addNode(node);

    // Map relationships from metadata relations
    const relations = [
      { key: 'references', type: 'REFERENCES', multiple: true },
      { key: 'belongsTo', type: 'BELONGS_TO', multiple: false },
      { key: 'created', type: 'CREATED', multiple: false },
      { key: 'prefers', type: 'PREFERS', multiple: false },
      { key: 'relatedTo', type: 'RELATED_TO', multiple: false },
      { key: 'worksWith', type: 'WORKS_WITH', multiple: false }
    ];

    for (const rel of relations) {
      const val = record.metadata[rel.key];
      if (!val) continue;

      const targets = rel.multiple && Array.isArray(val) ? val : [val];
      for (const targetId of targets) {
        if (typeof targetId !== 'string') continue;

        const edge: KnowledgeEdge = {
          id: `edge-${record.id}-${rel.type}-${targetId}`,
          source: record.id,
          target: targetId,
          type: rel.type,
          properties: {},
          weight: 1.0,
          confidence: record.confidence || 1.0,
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        try {
          await this.runtime.addEdge(edge);
        } catch (err) {
          // Fail-open: ignore edge errors (e.g. if target node is not registered yet)
        }
      }
    }
  }

  /**
   * Memory Lifecycle Listener hook to keep graph index synchronized.
   */
  public async handleMemoryEvent(event: any): Promise<void> {
    if (!featureFlags.GRAPH_INDEXING) return;

    const type = event.type;
    const details = event.details || {};

    if (type === 'STORE' || type === 'UPDATE') {
      const record = details.record;
      if (record) {
        await this.indexRecord(record);
      }
    } else if (type === 'DELETE') {
      const id = details.id;
      if (id) {
        await this.runtime.deleteNode(id);
      }
    }
  }
}
