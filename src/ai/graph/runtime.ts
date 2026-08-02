import { 
  GraphStorage, 
  KnowledgeNode, 
  KnowledgeEdge, 
  KnowledgeGraph, 
  GraphQuery, 
  GraphLifecycleEvent, 
  GraphLifecycleEventType, 
  GraphLifecycleListener 
} from './types';
import { RelationshipRegistry } from './registry';
import { GraphAlgorithms, BFSTraversalStrategy } from './algorithms';

export class GraphRuntime {
  private listeners: Set<GraphLifecycleListener> = new Set();
  private algorithms: GraphAlgorithms;

  constructor(
    private storage: GraphStorage,
    private registry: RelationshipRegistry
  ) {
    this.algorithms = new GraphAlgorithms(storage);
  }

  public addListener(listener: GraphLifecycleListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: GraphLifecycleListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(
    type: GraphLifecycleEventType,
    nodeId?: string,
    edgeId?: string,
    details?: Record<string, any>
  ): void {
    const event: GraphLifecycleEvent = {
      type,
      timestamp: new Date().toISOString(),
      nodeId,
      edgeId,
      details
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[GraphRuntime] Listener execution failed:", err);
      }
    }
  }

  public async addNode(node: KnowledgeNode): Promise<void> {
    await this.storage.addNode(node);
    this.emitEvent('NODE_ADDED', node.id, undefined, { node });
  }

  public async updateNode(id: string, properties: Partial<Record<string, any>>): Promise<void> {
    await this.storage.updateNode(id, properties);
    this.emitEvent('NODE_UPDATED', id, undefined, { properties });
  }

  public async deleteNode(id: string): Promise<void> {
    await this.storage.deleteNode(id);
    this.emitEvent('NODE_DELETED', id);
  }

  public async addEdge(edge: KnowledgeEdge): Promise<void> {
    if (!this.registry.validateType(edge.type)) {
      throw new Error(`Invalid relationship type "${edge.type}". Must be registered in RelationshipRegistry.`);
    }
    // Verify source and target nodes exist
    const sourceNode = await this.storage.getNode(edge.source);
    const targetNode = await this.storage.getNode(edge.target);
    if (!sourceNode || !targetNode) {
      throw new Error(`Cannot add edge. Source "${edge.source}" and/or Target "${edge.target}" nodes do not exist.`);
    }

    await this.storage.addEdge(edge);
    this.emitEvent('EDGE_ADDED', undefined, edge.id, { edge });
  }

  public async deleteEdge(id: string): Promise<void> {
    await this.storage.deleteEdge(id);
    this.emitEvent('EDGE_DELETED', undefined, id);
  }

  public async neighbors(nodeId: string): Promise<{ node: KnowledgeNode; edge: KnowledgeEdge }[]> {
    return this.storage.getNeighbors(nodeId);
  }

  public async shortestPath(startNodeId: string, endNodeId: string): Promise<string[] | null> {
    return this.algorithms.getShortestPath(startNodeId, endNodeId);
  }

  public async subgraph(nodeIds: string[]): Promise<KnowledgeGraph> {
    const nodeSet = new Set(nodeIds);
    const resultNodes: Record<string, KnowledgeNode> = {};
    const resultEdges: Record<string, KnowledgeEdge> = {};

    for (const nodeId of nodeIds) {
      const node = await this.storage.getNode(nodeId);
      if (node) {
        resultNodes[nodeId] = node;
      }
    }

    const allEdges = await this.storage.getEdges();
    for (const edge of allEdges) {
      if (nodeSet.has(edge.source) && nodeSet.has(edge.target)) {
        resultEdges[edge.id] = edge;
      }
    }

    return {
      nodes: resultNodes,
      edges: resultEdges
    };
  }

  public async search(query: GraphQuery): Promise<KnowledgeNode[]> {
    let nodes = await this.storage.getNodes();

    if (query.nodeType) {
      nodes = nodes.filter(n => n.type.toUpperCase() === query.nodeType!.toUpperCase());
    }

    if (query.propertyFilters) {
      for (const [key, value] of Object.entries(query.propertyFilters)) {
        nodes = nodes.filter(n => n.properties[key] === value);
      }
    }

    if (query.searchQuery) {
      const q = query.searchQuery.toLowerCase();
      nodes = nodes.filter(n => 
        n.label.toLowerCase().includes(q) || 
        n.id.toLowerCase().includes(q) ||
        (n.properties.content && String(n.properties.content).toLowerCase().includes(q)) ||
        Object.values(n.properties).some(val => typeof val === 'string' && val.toLowerCase().includes(q))
      );
    }

    if (query.limit && query.limit > 0) {
      nodes = nodes.slice(0, query.limit);
    }

    return nodes;
  }
}
