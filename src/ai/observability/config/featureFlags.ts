export interface ObservabilityFeatureFlags {
  LANGFUSE_ENABLED: boolean;
  LANGFUSE_CAPTURE_INPUT: boolean;
  LANGFUSE_CAPTURE_OUTPUT: boolean;
}

export const featureFlags: ObservabilityFeatureFlags = {
  LANGFUSE_ENABLED: false,
  LANGFUSE_CAPTURE_INPUT: false,
  LANGFUSE_CAPTURE_OUTPUT: false,
};
