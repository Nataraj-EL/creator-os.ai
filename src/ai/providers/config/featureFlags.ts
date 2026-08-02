export interface ProviderFeatureFlags {
  PROVIDERS_ENABLED: boolean;
  STREAMING_ENABLED: boolean;
  RETRY_ENABLED: boolean;
}

export const featureFlags: ProviderFeatureFlags = {
  PROVIDERS_ENABLED: false,
  STREAMING_ENABLED: false,
  RETRY_ENABLED: false,
};
