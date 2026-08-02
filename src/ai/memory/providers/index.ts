import { MemoryProvider } from '../types';

export class MemoryProviderRegistry {
  private providers = new Map<string, MemoryProvider>();
  private defaultProviderName: string = '';

  public register(provider: MemoryProvider): void {
    this.providers.set(provider.name, provider);
    if (!this.defaultProviderName) {
      this.defaultProviderName = provider.name;
    }
  }

  public get(name: string): MemoryProvider | null {
    return this.providers.get(name) || null;
  }

  public defaultProvider(): MemoryProvider | null {
    return this.providers.get(this.defaultProviderName) || null;
  }

  public list(): string[] {
    return Array.from(this.providers.keys());
  }

  public clear(): void {
    this.providers.clear();
    this.defaultProviderName = '';
  }
}

export const memoryProviderRegistry = new MemoryProviderRegistry();
export * from './creatorMemoryProvider';
