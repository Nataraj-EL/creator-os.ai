export interface MCPFeatureFlags {
  MCP_RUNTIME: boolean;
  MCP_REMOTE: boolean;
  MCP_CACHING: boolean;
}

export const featureFlags: MCPFeatureFlags = {
  MCP_RUNTIME: false,
  MCP_REMOTE: false,
  MCP_CACHING: false,
};
