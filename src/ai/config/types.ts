export type ConfigSource = 
  | 'DEFAULT' 
  | 'ENV' 
  | 'TENANT' 
  | 'WORKSPACE' 
  | 'USER' 
  | 'RUNTIME';

export type ConfigProfile = 'development' | 'production' | 'test';

export interface ConfigSchemaItem {
  type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object';
  required?: boolean;
  default?: any;
  enum?: any[];
  properties?: Record<string, ConfigSchemaItem>; // For nested validation
  validate?: (val: any) => boolean | string; // Custom validation function
}

export type ConfigSchema = Record<string, ConfigSchemaItem>;

export interface ConfigProvider {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  getAll(): Promise<Record<string, any>>;
}

export interface SecretRotationEvent {
  secretKey: string;
  timestamp: string;
}

export type SecretRotationListener = (event: SecretRotationEvent) => void;

export interface SecretProvider {
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  refresh(): Promise<void>;
  addListener(listener: SecretRotationListener): void;
  removeListener(listener: SecretRotationListener): void;
}

export interface ConfigCache {
  get(key: string): any;
  set(key: string, value: any, isSecret?: boolean): void;
  delete(key: string): void;
  clear(): void;
}

export type ConfigEventType = 
  | 'CONFIG_LOADED' 
  | 'CONFIG_UPDATED' 
  | 'SECRET_RESOLVED' 
  | 'CONFIG_VALIDATION_FAILED';

export interface ConfigEvent {
  type: ConfigEventType;
  timestamp: string;
  key?: string;
  source?: ConfigSource;
  details?: Record<string, any>;
}

export type ConfigListener = (event: ConfigEvent) => void;

export class ConfigValidationError extends Error {
  constructor(public readonly key: string, public readonly reason: string) {
    super(`Configuration Validation Failed for key "${key}": ${reason}`);
    this.name = 'ConfigValidationError';
  }
}
