export interface ContextFeatureFlags {
  CONTEXT_ENABLED: boolean;
  CONTEXT_COMPRESSION: boolean;
  CONTEXT_RANKING: boolean;
}

export const contextFeatureFlags: ContextFeatureFlags = {
  CONTEXT_ENABLED: false, // Disabled by default for Sprint 7
  CONTEXT_COMPRESSION: false,
  CONTEXT_RANKING: false
};
