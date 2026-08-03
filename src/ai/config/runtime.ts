import { 
  ConfigSource, 
  ConfigProvider, 
  SecretProvider, 
  ConfigSchema, 
  ConfigSchemaItem, 
  ConfigCache, 
  ConfigEvent, 
  ConfigEventType, 
  ConfigListener, 
  ConfigValidationError 
} from './types';
import { SecureConfigCache } from './cache';
import { featureFlags } from './featureFlags';

const LAYER_PRECEDENCE: ConfigSource[] = ['RUNTIME', 'USER', 'WORKSPACE', 'TENANT', 'ENV', 'DEFAULT'];

export class ConfigRuntime {
  private listeners: Set<ConfigListener> = new Set();
  private debouncedTimeout: NodeJS.Timeout | null = null;
  private changedKeys: Set<{ key: string; source?: ConfigSource }> = new Set();

  constructor(
    private layers: Map<ConfigSource, ConfigProvider>,
    private secretProvider: SecretProvider,
    private schema: ConfigSchema,
    private cache: ConfigCache = new SecureConfigCache()
  ) {
    // Bind to secret rotations
    this.secretProvider.addListener((event) => {
      this.cache.clear();
      this.triggerDebouncedChange(event.secretKey);
    });
  }

  public addListener(listener: ConfigListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: ConfigListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(
    type: ConfigEventType,
    key?: string,
    source?: ConfigSource,
    details?: Record<string, any>
  ): void {
    const event: ConfigEvent = {
      type,
      timestamp: new Date().toISOString(),
      key,
      source,
      details
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[ConfigRuntime] Listener failed:", err);
      }
    }
  }

  private triggerDebouncedChange(key: string, source?: ConfigSource): void {
    if (!featureFlags.CONFIG_HOT_RELOAD) return;
    this.changedKeys.add({ key, source });

    if (this.debouncedTimeout) {
      clearTimeout(this.debouncedTimeout);
    }

    this.debouncedTimeout = setTimeout(() => {
      const updates = Array.from(this.changedKeys);
      this.changedKeys.clear();
      this.debouncedTimeout = null;
      this.emitEvent('CONFIG_LOADED', undefined, undefined, { updates });
    }, 50);
  }

  public async get(key: string): Promise<any> {
    if (!featureFlags.CONFIG_RUNTIME) {
      const schemaItem = this.schema[key];
      return schemaItem?.default;
    }

    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    let rawVal: any = undefined;
    let foundSource: ConfigSource | undefined;

    for (const source of LAYER_PRECEDENCE) {
      const provider = this.layers.get(source);
      if (provider) {
        try {
          const val = await provider.get(key);
          if (val !== undefined) {
            rawVal = val;
            foundSource = source;
            break;
          }
        } catch (err) {
          // Fail-open for optional providers; continue precedence traversal
        }
      }
    }

    if (rawVal === undefined) {
      const schemaItem = this.schema[key];
      if (schemaItem && schemaItem.default !== undefined) {
        rawVal = schemaItem.default;
        foundSource = 'DEFAULT';
      }
    }

    if (rawVal === undefined) {
      const schemaItem = this.schema[key];
      if (schemaItem && schemaItem.required) {
        const error = new ConfigValidationError(key, `Required configuration is missing.`);
        this.emitEvent('CONFIG_VALIDATION_FAILED', key, undefined, { error: error.message });
        throw error;
      }
      return undefined;
    }

    let resolvedVal = rawVal;
    let isSecret = false;
    if (typeof rawVal === 'string' && rawVal.startsWith('${secret:') && rawVal.endsWith('}')) {
      if (!featureFlags.SECRET_PROVIDER) {
        throw new Error(`Secret provider is disabled but secret placeholder was requested.`);
      }
      const secretKey = rawVal.substring(9, rawVal.length - 1);
      const secretVal = await this.secretProvider.getSecret(secretKey);
      if (secretVal === null) {
        throw new Error(`Secret key "${secretKey}" was not found.`);
      }
      resolvedVal = secretVal;
      isSecret = true;
      this.emitEvent('SECRET_RESOLVED', key, foundSource, { secretKey });
    }

    const schemaItem = this.schema[key];
    if (schemaItem) {
      try {
        this.validateSchemaItem(key, resolvedVal, schemaItem);
      } catch (err: any) {
        this.emitEvent('CONFIG_VALIDATION_FAILED', key, foundSource, { error: err.message });
        throw err;
      }
    }

    this.cache.set(key, resolvedVal, isSecret);
    return resolvedVal;
  }

  public async set(source: ConfigSource, key: string, value: any): Promise<void> {
    const provider = this.layers.get(source);
    if (!provider) {
      throw new Error(`ConfigProvider for source "${source}" not registered.`);
    }

    const schemaItem = this.schema[key];
    if (schemaItem) {
      try {
        this.validateSchemaItem(key, value, schemaItem);
      } catch (err: any) {
        this.emitEvent('CONFIG_VALIDATION_FAILED', key, source, { error: err.message });
        throw err;
      }
    }

    await provider.set(key, value);
    this.cache.delete(key);
    this.emitEvent('CONFIG_UPDATED', key, source, { value });
    this.triggerDebouncedChange(key, source);
  }

  public async hotReload(): Promise<void> {
    this.cache.clear();
    this.emitEvent('CONFIG_LOADED', undefined, undefined, { action: 'hotReload' });
  }

  private validateSchemaItem(key: string, val: any, item: ConfigSchemaItem): void {
    if (val === undefined || val === null) {
      if (item.required) {
        throw new ConfigValidationError(key, `Field is required but missing.`);
      }
      return;
    }

    if (item.type === 'enum') {
      if (!item.enum || !item.enum.includes(val)) {
        throw new ConfigValidationError(key, `Value must be one of [${item.enum?.join(', ') || ''}].`);
      }
    } else if (item.type === 'array') {
      if (!Array.isArray(val)) {
        throw new ConfigValidationError(key, `Value must be an array.`);
      }
    } else if (item.type === 'object') {
      if (typeof val !== 'object' || Array.isArray(val)) {
        throw new ConfigValidationError(key, `Value must be an object.`);
      }
      if (item.properties) {
        for (const [subKey, subSchema] of Object.entries(item.properties)) {
          this.validateSchemaItem(`${key}.${subKey}`, val[subKey], subSchema);
        }
      }
    } else {
      if (typeof val !== item.type) {
        throw new ConfigValidationError(key, `Value must be of type ${item.type}.`);
      }
    }

    if (item.validate) {
      const res = item.validate(val);
      if (res !== true) {
        throw new ConfigValidationError(key, typeof res === 'string' ? res : 'Custom validation failed.');
      }
    }
  }
}
