import { EvaluationRepository } from '../types';
import { LocalStorageEvaluationRepository } from './localStorageRepository';

export class EvaluationRepositoryFactory {
  private static instance: EvaluationRepository | null = null;

  public static getRepository(): EvaluationRepository {
    if (!this.instance) {
      this.instance = new LocalStorageEvaluationRepository();
    }
    return this.instance;
  }

  public static registerRepository(repo: EvaluationRepository): void {
    this.instance = repo;
  }
}
