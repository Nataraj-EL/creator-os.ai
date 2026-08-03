export interface PluginFeatureFlags {
  PLUGIN_RUNTIME: boolean;
  PLUGIN_AUTOLOAD: boolean;
}

export const featureFlags: PluginFeatureFlags = {
  PLUGIN_RUNTIME: false,
  PLUGIN_AUTOLOAD: false,
};
