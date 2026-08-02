export interface RetrievalFeatureFlags {
  SEMANTIC_RETRIEVAL: boolean;
  HYBRID_RETRIEVAL: boolean;
  EMBEDDINGS_ENABLED: boolean;
}

export const retrievalFeatureFlags: RetrievalFeatureFlags = {
  SEMANTIC_RETRIEVAL: false, // Disabled by default for Sprint 11
  HYBRID_RETRIEVAL: false,
  EMBEDDINGS_ENABLED: false
};
