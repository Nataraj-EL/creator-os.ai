export interface KnowledgeNode {
  id: string;
  label: string; // descriptive identifier/name
  type: string;  // e.g. PROFILE, CONVERSATION, KNOWLEDGE
  properties: Record<string, any>;
  weight: number;      // weight score
  confidence: number;  // confidence score (0.0 - 1.0)
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeEdge {
  id: string;
  source: string; // source node ID
  target: string; // target node ID
  type: string;   // relationship identifier e.g. CREATED, REFERENCES
  properties: Record<string, any>;
  weight: number;
  confidence: number;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeGraph {
  nodes: Record<string, KnowledgeNode>;
  edges: Record<string, KnowledgeEdge>;
}

export interface GraphQuery {
  nodeType?: string;
  edgeType?: string;
  propertyFilters?: Record<string, any>;
  searchQuery?: string;
  limit?: number;
}

export interface GraphStorage {
  addNode(node: KnowledgeNode): Promise<void>;
  getNode(id: string): Promise<KnowledgeNode | null>;
  updateNode(id: string, properties: Partial<Record<string, any>>): Promise<void>;
  deleteNode(id: string): Promise<void>;
  addEdge(edge: KnowledgeEdge): Promise<void>;
  getEdge(id: string): Promise<KnowledgeEdge | null>;
  deleteEdge(id: string): Promise<void>;
  getNeighbors(nodeId: string): Promise<{ node: KnowledgeNode; edge: KnowledgeEdge }[]>;
  getNodes(): Promise<KnowledgeNode[]>;
  getEdges(): Promise<KnowledgeEdge[]>;
}

export type GraphLifecycleEventType =
  | 'NODE_ADDED'
  | 'NODE_UPDATED'
  | 'NODE_DELETED'
  | 'EDGE_ADDED'
  | 'EDGE_DELETED';

export interface GraphLifecycleEvent {
  type: GraphLifecycleEventType;
  timestamp: string;
  nodeId?: string;
  edgeId?: string;
  details?: Record<string, any>;
}

export type GraphLifecycleListener = (event: GraphLifecycleEvent) => void;
