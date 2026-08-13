import { MemoryRepository } from '../types';
import { LocalStorageMemoryRepository } from './localStorageRepository';
import { PgVectorMemoryRepository } from './pgVectorRepository';
import { memoryFeatureFlags } from '../config/featureFlags';
import { getEmbeddingProvider } from '../embeddings';

export class MemoryRepositoryFactory {
  private static instance: MemoryRepository | null = null;

  public static getRepository(): MemoryRepository {
    if (!this.instance) {
      const dbUrl = 
        process.env.DATABASE_URL || 
        process.env.DATABASE_URL_NEON || 
        process.env.POSTGRES_URL || 
        process.env.POSTGRES_PRISMA_URL || 
        process.env.POSTGRES_URL_NON_POOLING || 
        '';
      if (memoryFeatureFlags.VECTOR_MEMORY && dbUrl) {
        try {
          const provider = getEmbeddingProvider();
          this.instance = new PgVectorMemoryRepository(dbUrl, provider);
        } catch (err) {
          console.error("[MemoryRepositoryFactory] Failed to initialize PgVectorMemoryRepository, falling back:", err);
          this.instance = new LocalStorageMemoryRepository();
        }
      } else {
        this.instance = new LocalStorageMemoryRepository();
      }
    }
    return this.instance;
  }

  public static registerRepository(repository: MemoryRepository): void {
    this.instance = repository;
  }

  public static clear(): void {
    if (this.instance && (this.instance as any).dispose) {
      try {
        (this.instance as any).dispose();
      } catch (err) {
        // fail-open
      }
    }
    this.instance = null;
  }
}
