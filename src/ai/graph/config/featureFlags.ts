export interface GraphFeatureFlags {
  KNOWLEDGE_GRAPH: boolean;
  GRAPH_INDEXING: boolean;
}

export const featureFlags: GraphFeatureFlags = {
  KNOWLEDGE_GRAPH: false,
  GRAPH_INDEXING: false,
};
