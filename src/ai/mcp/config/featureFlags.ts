export interface MCPFeatureFlags {
  MCP_RUNTIME: boolean;
  MCP_REMOTE: boolean;
  MCP_CACHING: boolean;
  MCP_EXTERNAL_SERVERS: boolean;
  MCP_STDIO: boolean;
  MCP_HTTP: boolean;
}

export const featureFlags: MCPFeatureFlags = {
  MCP_RUNTIME: false,
  MCP_REMOTE: false,
  MCP_CACHING: false,
  MCP_EXTERNAL_SERVERS: false,
  MCP_STDIO: false,
  MCP_HTTP: false,
};
