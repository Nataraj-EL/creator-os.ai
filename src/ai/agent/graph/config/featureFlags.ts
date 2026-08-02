export interface AgentGraphFeatureFlags {
  AGENT_GRAPH: boolean;
  AGENT_CONDITIONALS: boolean;
}

export const featureFlags: AgentGraphFeatureFlags = {
  AGENT_GRAPH: false,
  AGENT_CONDITIONALS: false,
};
