import { ResourceCache } from './types';

interface CacheEntry {
  content: string;
  expiresAt?: number;
}

export class InMemoryResourceCache implements ResourceCache {
  private cache: Map<string, CacheEntry> = new Map();

  public async get(uri: string): Promise<string | null> {
    const entry = this.cache.get(uri);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.cache.delete(uri);
      return null;
    }
    return entry.content;
  }

  public async set(uri: string, content: string, ttlMs?: number): Promise<void> {
    const expiresAt = ttlMs ? Date.now() + ttlMs : undefined;
    this.cache.set(uri, { content, expiresAt });
  }

  public async delete(uri: string): Promise<void> {
    this.cache.delete(uri);
  }

  public clear(): void {
    this.cache.clear();
  }
}
