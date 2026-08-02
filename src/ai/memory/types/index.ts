export enum MemoryType {
  PROFILE = 'PROFILE',
  CONVERSATION = 'CONVERSATION',
  PREFERENCE = 'PREFERENCE',
  PROJECT = 'PROJECT',
  BRAND = 'BRAND',
  KNOWLEDGE = 'KNOWLEDGE'
}

export enum MemorySearchStrategy {
  KEYWORD = 'KEYWORD',
  SEMANTIC = 'SEMANTIC',
  HYBRID = 'HYBRID'
}

export interface MemoryRecord {
  id: string;
  creatorId: string;
  content: string;
  tags: string[];
  type: MemoryType;
  importance: number; // e.g., 1 to 10 scale
  source: string; // e.g., 'user', 'generation', 'agent'
  confidence: number; // e.g., 0.0 to 1.0 confidence score
  lastAccessed: string; // ISO timestamp
  accessCount: number;
  expiresAt?: string; // Optional ISO timestamp
  embeddingVersion?: string; // Optional model identifier version
  relevanceScore?: number; // Optional similarity/relevance rank score
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryQuery {
  creatorId: string;
  text?: string;
  tags?: string[];
  limit?: number;
  strategy?: MemorySearchStrategy;
  metadataFilters?: Record<string, any>;
}

export interface MemoryContext {
  userId: string;
  sessionId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

export interface MemoryProvider {
  name: string;
  version: string;
  supportedOperations: string[];
  store(record: MemoryRecord): Promise<void>;
  retrieve(id: string): Promise<MemoryRecord | null>;
  update(record: MemoryRecord): Promise<void>;
  delete(id: string): Promise<void>;
  search(query: MemoryQuery): Promise<MemoryRecord[]>;
}

export interface MemoryRepository {
  save(record: MemoryRecord): Promise<void>;
  findById(id: string): Promise<MemoryRecord | null>;
  update(record: MemoryRecord): Promise<void>;
  deleteById(id: string): Promise<void>;
  query(query: MemoryQuery): Promise<MemoryRecord[]>;
}

export interface MemoryService {
  store(
    context: MemoryContext, 
    content: string, 
    tags: string[], 
    type: MemoryType, 
    options?: { 
      importance?: number; 
      source?: string; 
      confidence?: number; 
      expiresAt?: string; 
      metadata?: Record<string, any>;
    }
  ): Promise<MemoryRecord | null>;
  retrieve(context: MemoryContext, id: string): Promise<MemoryRecord | null>;
  update(
    context: MemoryContext, 
    id: string, 
    updates: Partial<Pick<MemoryRecord, 'content' | 'tags' | 'importance' | 'confidence' | 'metadata'>>
  ): Promise<MemoryRecord | null>;
  delete(context: MemoryContext, id: string): Promise<boolean>;
  search(context: MemoryContext, query: Omit<MemoryQuery, 'creatorId'>): Promise<MemoryRecord[]>;
}

export type MemoryLifecycleEventType = 'STORE' | 'RETRIEVE' | 'UPDATE' | 'DELETE' | 'SEARCH';

export interface MemoryLifecycleEvent {
  type: MemoryLifecycleEventType;
  timestamp: string;
  context: MemoryContext;
  details: Record<string, any>;
}

export type MemoryLifecycleListener = (event: MemoryLifecycleEvent) => void;
