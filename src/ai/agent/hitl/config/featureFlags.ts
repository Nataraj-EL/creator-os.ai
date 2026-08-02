export interface HITLFeatureFlags {
  HITL_RUNTIME: boolean;
  HITL_CHECKPOINTS: boolean;
}

export const featureFlags: HITLFeatureFlags = {
  HITL_RUNTIME: false,
  HITL_CHECKPOINTS: false,
};
