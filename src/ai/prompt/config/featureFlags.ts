export interface PromptFeatureFlags {
  CONTEXT_INJECTION: boolean;
  PROMPT_BUILDER: boolean;
}

export const promptFeatureFlags: PromptFeatureFlags = {
  CONTEXT_INJECTION: false, // Disabled by default for Sprint 9
  PROMPT_BUILDER: false
};
