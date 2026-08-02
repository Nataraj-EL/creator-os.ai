export enum ContextStrategy {
  BALANCED = 'BALANCED',
  RECENCY_FIRST = 'RECENCY_FIRST',
  IMPORTANCE_FIRST = 'IMPORTANCE_FIRST',
  SEMANTIC_FIRST = 'SEMANTIC_FIRST'
}

export interface ContextBlock {
  id: string;
  content: string;
  source: string; // e.g., 'memory', 'knowledge', 'system'
  relevanceScore: number; // 0.0 to 1.0 similarity score
  importance: number; // 1 to 10 scale
  timestamp: string; // ISO date string
  tokenCount: number;
  selectionReason?: string;
  metadata: Record<string, any>;
}

export interface ContextRequest {
  userId: string;
  prompt: string;
  tags?: string[];
  tokenBudget?: number; // Maximum allowed tokens
  strategy?: ContextStrategy;
  metadata?: Record<string, any>;
}

export interface ContextResult {
  requestId: string;
  blocks: ContextBlock[];
  totalTokens: number;
  tokenBudget: number;
  strategy: ContextStrategy;
  metadata?: Record<string, any>;
}

export interface ContextRankingStrategy {
  name: ContextStrategy;
  rank(blocks: ContextBlock[]): ContextBlock[];
}

export interface ContextCompressor {
  name: string;
  compress(blocks: ContextBlock[], budget: number): Promise<ContextBlock[]> | ContextBlock[];
}

export interface ContextAssemblyService {
  assemble(request: ContextRequest): Promise<ContextResult>;
}

export type ContextLifecycleEventType = 
  | 'ASSEMBLY_STARTED' 
  | 'RETRIEVAL_COMPLETED' 
  | 'RANKING_COMPLETED' 
  | 'COMPRESSION_COMPLETED' 
  | 'ASSEMBLY_COMPLETED';

export interface ContextLifecycleEvent {
  type: ContextLifecycleEventType;
  timestamp: string;
  requestId: string;
  details: Record<string, any>;
}

export type ContextLifecycleListener = (event: ContextLifecycleEvent) => void;
