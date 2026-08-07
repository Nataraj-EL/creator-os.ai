export interface SdkFeatureFlags {
  SDK_RUNTIME: boolean;
  SDK_STREAMING: boolean;
  SDK_GENERATOR: boolean;
}

export const featureFlags: SdkFeatureFlags = {
  SDK_RUNTIME: false,
  SDK_STREAMING: false,
  SDK_GENERATOR: false,
};
