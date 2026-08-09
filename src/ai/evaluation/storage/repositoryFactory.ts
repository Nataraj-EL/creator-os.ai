import { EvaluationRepository } from '../types';
import { LocalStorageEvaluationRepository } from './localStorageRepository';
import { PostgresEvaluationRepository } from './postgresEvaluationRepository';

export class EvaluationRepositoryFactory {
  private static instance: EvaluationRepository | null = null;

  public static getRepository(): EvaluationRepository {
    if (!this.instance) {
      if (typeof window === 'undefined') {
        const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_NEON || '';
        this.instance = new PostgresEvaluationRepository(connectionString);
      } else {
        this.instance = new LocalStorageEvaluationRepository();
      }
    }
    return this.instance;
  }

  public static registerRepository(repo: EvaluationRepository): void {
    this.instance = repo;
  }
}
