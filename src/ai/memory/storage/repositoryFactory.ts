import { MemoryRepository } from '../types';
import { LocalStorageMemoryRepository } from './localStorageRepository';

export class MemoryRepositoryFactory {
  private static instance: MemoryRepository | null = null;

  public static getRepository(): MemoryRepository {
    if (!this.instance) {
      this.instance = new LocalStorageMemoryRepository();
    }
    return this.instance;
  }

  public static registerRepository(repository: MemoryRepository): void {
    this.instance = repository;
  }

  public static clear(): void {
    this.instance = null;
  }
}
