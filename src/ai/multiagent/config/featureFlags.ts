export interface MultiAgentFeatureFlags {
  MULTI_AGENT: boolean;
  PARALLEL_AGENTS: boolean;
}

export const featureFlags: MultiAgentFeatureFlags = {
  MULTI_AGENT: false,
  PARALLEL_AGENTS: false,
};
