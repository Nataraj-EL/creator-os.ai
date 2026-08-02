import { EmbeddingProvider, VectorStoreProvider } from '../types';

export class RetrievalProviderRegistry {
  private providers: Map<string, EmbeddingProvider> = new Map();
  private defaultName: string | null = null;

  public register(provider: EmbeddingProvider, isDefault = false): void {
    this.providers.set(provider.name, provider);
    if (isDefault || !this.defaultName) {
      this.defaultName = provider.name;
    }
  }

  public getProvider(name?: string): EmbeddingProvider | null {
    const targetName = name || this.defaultName;
    return targetName ? this.providers.get(targetName) || null : null;
  }

  public clear(): void {
    this.providers.clear();
    this.defaultName = null;
  }
}

export class VectorStoreRegistry {
  private stores: Map<string, VectorStoreProvider> = new Map();
  private defaultName: string | null = null;

  public register(store: VectorStoreProvider, isDefault = false): void {
    this.stores.set(store.name, store);
    if (isDefault || !this.defaultName) {
      this.defaultName = store.name;
    }
  }

  public getStore(name?: string): VectorStoreProvider | null {
    const targetName = name || this.defaultName;
    return targetName ? this.stores.get(targetName) || null : null;
  }

  public clear(): void {
    this.stores.clear();
    this.defaultName = null;
  }
}

export const retrievalProviderRegistry = new RetrievalProviderRegistry();
export const vectorStoreRegistry = new VectorStoreRegistry();
