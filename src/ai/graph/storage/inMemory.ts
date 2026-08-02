import { GraphStorage, KnowledgeNode, KnowledgeEdge } from '../types';

export class InMemoryGraphStorage implements GraphStorage {
  private nodes: Map<string, KnowledgeNode> = new Map();
  private edges: Map<string, KnowledgeEdge> = new Map();

  public async addNode(node: KnowledgeNode): Promise<void> {
    this.nodes.set(node.id, { ...node });
  }

  public async getNode(id: string): Promise<KnowledgeNode | null> {
    const node = this.nodes.get(id);
    return node ? { ...node } : null;
  }

  public async updateNode(id: string, properties: Partial<Record<string, any>>): Promise<void> {
    const node = this.nodes.get(id);
    if (node) {
      node.properties = { ...node.properties, ...properties };
      node.updatedAt = new Date().toISOString();
    }
  }

  public async deleteNode(id: string): Promise<void> {
    this.nodes.delete(id);
    for (const [edgeId, edge] of this.edges.entries()) {
      if (edge.source === id || edge.target === id) {
        this.edges.delete(edgeId);
      }
    }
  }

  public async addEdge(edge: KnowledgeEdge): Promise<void> {
    this.edges.set(edge.id, { ...edge });
  }

  public async getEdge(id: string): Promise<KnowledgeEdge | null> {
    const edge = this.edges.get(id);
    return edge ? { ...edge } : null;
  }

  public async deleteEdge(id: string): Promise<void> {
    this.edges.delete(id);
  }

  public async getNeighbors(nodeId: string): Promise<{ node: KnowledgeNode; edge: KnowledgeEdge }[]> {
    const neighbors: { node: KnowledgeNode; edge: KnowledgeEdge }[] = [];
    for (const edge of this.edges.values()) {
      if (edge.source === nodeId) {
        const targetNode = this.nodes.get(edge.target);
        if (targetNode) {
          neighbors.push({ node: { ...targetNode }, edge: { ...edge } });
        }
      } else if (edge.target === nodeId) {
        const sourceNode = this.nodes.get(edge.source);
        if (sourceNode) {
          neighbors.push({ node: { ...sourceNode }, edge: { ...edge } });
        }
      }
    }
    return neighbors;
  }

  public async getNodes(): Promise<KnowledgeNode[]> {
    return Array.from(this.nodes.values()).map(n => ({ ...n }));
  }

  public async getEdges(): Promise<KnowledgeEdge[]> {
    return Array.from(this.edges.values()).map(e => ({ ...e }));
  }
}
