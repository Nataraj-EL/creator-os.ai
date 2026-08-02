export interface AgentFeatureFlags {
  AGENT_RUNTIME: boolean;
  AGENT_PLANNING: boolean;
}

export const featureFlags: AgentFeatureFlags = {
  AGENT_RUNTIME: false,
  AGENT_PLANNING: false,
};
