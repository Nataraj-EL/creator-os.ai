export interface PolicyFeatureFlags {
  POLICY_RUNTIME: boolean;
  INPUT_GUARDRAILS: boolean;
  OUTPUT_GUARDRAILS: boolean;
}

export const featureFlags: PolicyFeatureFlags = {
  POLICY_RUNTIME: false,
  INPUT_GUARDRAILS: false,
  OUTPUT_GUARDRAILS: false,
};
