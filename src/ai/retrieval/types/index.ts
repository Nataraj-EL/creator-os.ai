export interface EmbeddingResult {
  vector: number[];
  dimension: number;
  model: string;
  provider: string;
  embeddingVersion: string;
  metadata: Record<string, any>;
}

export interface EmbeddingProvider {
  name: string;
  version: string;
  embed(text: string): Promise<EmbeddingResult>;
}

export interface VectorStoreRecord {
  id: string;
  vector: number[];
  metadata: Record<string, any>;
}

export interface VectorStoreProvider {
  name: string;
  store(record: VectorStoreRecord): Promise<void>;
  delete(id: string): Promise<void>;
  query(
    vector: number[], 
    topK: number, 
    filters?: Record<string, any>
  ): Promise<Array<{ record: VectorStoreRecord; similarity: number }>>;
}

export interface RetrievalMetadata {
  provider: string;
  strategy: string;
  embeddingVersion: string;
  latency: number;
  reason?: string;
}

export interface RetrievalResult {
  memoryId: string;
  similarityScore: number;
  keywordScore: number;
  finalScore: number;
  retrievalReason: string;
  metadata: RetrievalMetadata;
}

export interface RetrievalQuery {
  text: string;
  creatorId: string;
  tags?: string[];
  topK?: number;
  metadataFilters?: Record<string, any>;
}

export interface HybridRankingStrategy {
  name: string;
  combine(semanticScore: number, keywordScore: number): number;
}

export interface VectorIndexer {
  upsert(id: string, text: string, metadata: Record<string, any>): Promise<void>;
  reindex(ids: string[]): Promise<void>;
}

export type RetrievalLifecycleEventType = 
  | 'EMBEDDING_STARTED'
  | 'EMBEDDING_COMPLETED'
  | 'SEARCH_STARTED'
  | 'SEARCH_COMPLETED';

export interface RetrievalLifecycleEvent {
  type: RetrievalLifecycleEventType;
  timestamp: string;
  details: Record<string, any>;
}

export type RetrievalLifecycleListener = (event: RetrievalLifecycleEvent) => void;
