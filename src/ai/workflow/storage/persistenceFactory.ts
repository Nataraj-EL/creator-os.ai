import { WorkflowPersistenceStore, InMemoryWorkflowPersistenceStore } from '../persistence';
import { PostgresWorkflowPersistenceStore } from './postgresPersistence';
import { featureFlags } from '../config/featureFlags';

export class WorkflowPersistenceFactory {
  private static instance: WorkflowPersistenceStore | null = null;

  public static getStore(): WorkflowPersistenceStore {
    if (this.instance) return this.instance;

    const dbUrl = process.env.DATABASE_URL || '';
    const usePostgres = featureFlags.POSTGRES_WORKFLOW_PERSISTENCE && featureFlags.DURABLE_WORKFLOWS;

    if (usePostgres && dbUrl) {
      const pgStore = new PostgresWorkflowPersistenceStore(dbUrl);
      pgStore.initialize().catch(err => {
        console.error("[WorkflowPersistenceFactory] Failed to initialize Postgres workflow store:", err);
      });
      this.instance = pgStore;
    } else {
      this.instance = new InMemoryWorkflowPersistenceStore();
    }

    return this.instance;
  }

  public static clear(): void {
    this.instance = null;
  }
}
