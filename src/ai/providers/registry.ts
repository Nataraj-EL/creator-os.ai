import { AIProvider } from './types';

export class ProviderRegistry {
  private providers = new Map<string, AIProvider>();
  private defaultProviderName = 'mock';

  public register(provider: AIProvider): void {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  public unregister(name: string): void {
    this.providers.delete(name.toLowerCase());
  }

  public resolve(name?: string): AIProvider {
    const target = (name || this.defaultProviderName).toLowerCase();
    const provider = this.providers.get(target);
    if (!provider) {
      throw new Error(`[ProviderRegistry] Provider "${name || this.defaultProviderName}" is not registered.`);
    }
    return provider;
  }

  public setDefaultProvider(name: string): void {
    this.defaultProviderName = name;
  }

  public getDefaultProviderName(): string {
    return this.defaultProviderName;
  }

  public listProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  public clear(): void {
    this.providers.clear();
  }
}

export const providerRegistry = new ProviderRegistry();

export interface ProviderResolver {
  resolve(name?: string): AIProvider;
}

export class DefaultProviderResolver implements ProviderResolver {
  constructor(private registry: ProviderRegistry) {}

  public resolve(name?: string): AIProvider {
    return this.registry.resolve(name);
  }
}

export const providerResolver = new DefaultProviderResolver(providerRegistry);
