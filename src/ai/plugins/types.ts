export type PluginState = 
  | 'INSTALLED' 
  | 'INITIALIZED' 
  | 'ACTIVE' 
  | 'INACTIVE' 
  | 'ERROR' 
  | 'UNINSTALLED';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  minRuntimeVersion?: string;
  dependencies?: Record<string, string>; // maps pluginId to semver version constraint
  capabilities: {
    providers?: boolean;
    tools?: boolean;
    policies?: boolean;
    evaluators?: boolean;
    agents?: boolean;
    workflows?: boolean;
    mcpServers?: boolean;
  };
  configDefaults?: Record<string, any>;
  uiExtensions?: any[];
}

export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface PluginContext {
  logger: PluginLogger;
  config: Record<string, any>;
  registries: Record<string, any>; // references core registries
  services: Record<string, any>;
}

export interface Plugin {
  manifest: PluginManifest;
  status: PluginState;
  install?(context: PluginContext): Promise<void> | void;
  initialize?(context: PluginContext): Promise<void> | void;
  activate?(context: PluginContext): Promise<void> | void;
  deactivate?(context: PluginContext): Promise<void> | void;
  uninstall?(context: PluginContext): Promise<void> | void;
}

export type PluginEventType = 
  | 'PLUGIN_INSTALLED' 
  | 'PLUGIN_ACTIVATED' 
  | 'PLUGIN_DEACTIVATED' 
  | 'PLUGIN_FAILED';

export interface PluginEvent {
  type: PluginEventType;
  timestamp: string;
  pluginId: string;
  durationMs?: number;
  details?: Record<string, any>;
}

export type PluginListener = (event: PluginEvent) => void;
