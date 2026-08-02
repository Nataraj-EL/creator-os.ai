export interface ToolFeatureFlags {
  TOOLS_ENABLED: boolean;
  TOOL_VALIDATION: boolean;
  TOOL_RETRIES: boolean;
}

export const featureFlags: ToolFeatureFlags = {
  TOOLS_ENABLED: false,
  TOOL_VALIDATION: false,
  TOOL_RETRIES: false,
};
