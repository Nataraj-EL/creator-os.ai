import { ConfigProvider, SecretProvider, SecretRotationListener, SecretRotationEvent } from './types';

export class InMemoryConfigProvider implements ConfigProvider {
  private values: Map<string, any> = new Map();

  public async get(key: string): Promise<any> {
    return this.values.get(key);
  }

  public async set(key: string, value: any): Promise<void> {
    this.values.set(key, value);
  }

  public async getAll(): Promise<Record<string, any>> {
    const result: Record<string, any> = {};
    for (const [k, v] of this.values.entries()) {
      result[k] = v;
    }
    return result;
  }

  public clear(): void {
    this.values.clear();
  }
}

export class InMemorySecretProvider implements SecretProvider {
  private secrets: Map<string, string> = new Map();
  private listeners: Set<SecretRotationListener> = new Set();

  public async getSecret(key: string): Promise<string | null> {
    return this.secrets.get(key) || null;
  }

  public async setSecret(key: string, value: string): Promise<void> {
    const oldVal = this.secrets.get(key);
    this.secrets.set(key, value);
    
    if (oldVal !== undefined && oldVal !== value) {
      this.emitRotation(key);
    }
  }

  public async refresh(): Promise<void> {
    // No-op for in-memory
  }

  public addListener(listener: SecretRotationListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: SecretRotationListener): void {
    this.listeners.delete(listener);
  }

  private emitRotation(secretKey: string): void {
    const event: SecretRotationEvent = {
      secretKey,
      timestamp: new Date().toISOString()
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[InMemorySecretProvider] Listener failed:", err);
      }
    }
  }

  public clear(): void {
    this.secrets.clear();
  }
}
