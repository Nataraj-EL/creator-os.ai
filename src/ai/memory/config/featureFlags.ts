export interface MemoryFeatureFlags {
  MEMORY_ENABLED: boolean;
  MEMORY_WRITE: boolean;
  MEMORY_READ: boolean;
  VECTOR_MEMORY: boolean;
  PGVECTOR_RETRIEVAL: boolean;
  EMBEDDING_PROVIDER: string; // 'gemini' | 'mock'
}

export const memoryFeatureFlags: MemoryFeatureFlags = {
  MEMORY_ENABLED: false,
  MEMORY_WRITE: false,
  MEMORY_READ: false,
  VECTOR_MEMORY: false,
  PGVECTOR_RETRIEVAL: false,
  EMBEDDING_PROVIDER: 'mock'
};
