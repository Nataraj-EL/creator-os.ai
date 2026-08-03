export interface ConfigFeatureFlags {
  CONFIG_RUNTIME: boolean;
  SECRET_PROVIDER: boolean;
  CONFIG_HOT_RELOAD: boolean;
}

export const featureFlags: ConfigFeatureFlags = {
  CONFIG_RUNTIME: false,
  SECRET_PROVIDER: false,
  CONFIG_HOT_RELOAD: false,
};
