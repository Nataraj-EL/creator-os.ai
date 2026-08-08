import pg from 'pg';
const { Pool } = pg;
import { WorkflowPersistenceStore } from '../persistence';
import { WorkflowExecution } from '../types';
import { InMemoryWorkflowPersistenceStore } from '../persistence';

export class PostgresWorkflowPersistenceStore implements WorkflowPersistenceStore {
  private pool?: pg.Pool;
  private fallback?: InMemoryWorkflowPersistenceStore;
  private isInitialized = false;

  constructor(private connectionString: string) {}

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      if (!this.connectionString) {
        throw new Error("No database connection string configured.");
      }
      this.pool = new Pool({
        connectionString: this.connectionString,
        ssl: this.connectionString.includes('neon') ? { rejectUnauthorized: false } : undefined
      });
      await this.pool.query('SELECT 1');
      this.isInitialized = true;
    } catch (err) {
      console.warn("[PostgresWorkflowPersistenceStore] Postgres connection failed. Using InMemory fallback:", err);
      this.fallback = new InMemoryWorkflowPersistenceStore();
      this.isInitialized = true;
    }
  }

  private ensureConnected(): void {
    if (!this.isInitialized) {
      throw new Error("PostgresWorkflowPersistenceStore not initialized. Call initialize() first.");
    }
  }

  public async saveExecution(execution: WorkflowExecution): Promise<void> {
    this.ensureConnected();
    if (this.fallback) {
      return this.fallback.saveExecution(execution);
    }

    try {
      const cleanVariables = this.redactSecrets(execution.variables);
      const cleanCompletedSteps = this.redactSecrets(execution.completedSteps);
      const cleanErrors = this.redactSecrets(execution.errors);

      const tenantId = cleanVariables.tenantId || 'default';
      const workspaceId = cleanVariables.workspaceId || 'default';
      const creatorId = cleanVariables.creatorId || 'default';

      const heartbeatAt = new Date().toISOString();
      const startedAt = execution.startTime || new Date().toISOString();
      const completedAt = execution.status === 'COMPLETED' ? new Date().toISOString() : null;

      // 1. Get current version for optimistic concurrency check
      const checkRes = await this.pool!.query(
        'SELECT version FROM workflow_executions WHERE execution_id = $1 AND tenant_id = $2 AND workspace_id = $3',
        [execution.executionId, tenantId, workspaceId]
      );

      if (checkRes.rows.length === 0) {
        // Insert new record
        const insertSql = `
          INSERT INTO workflow_executions (
            execution_id, workflow_id, workflow_version, status, current_step_id,
            variables, completed_steps, errors, tenant_id, workspace_id, creator_id,
            version, created_at, updated_at, started_at, completed_at, heartbeat_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $12, $13, $14)
        `;
        const insertValues = [
          execution.executionId,
          execution.workflowId,
          execution.workflowVersion,
          execution.status,
          execution.currentStepId,
          JSON.stringify(cleanVariables),
          JSON.stringify(cleanCompletedSteps),
          JSON.stringify(cleanErrors),
          tenantId,
          workspaceId,
          creatorId,
          startedAt,
          completedAt,
          heartbeatAt
        ];
        await this.pool!.query(insertSql, insertValues);
      } else {
        const currentVersion = checkRes.rows[0].version;

        // Update record with version check
        const updateSql = `
          UPDATE workflow_executions SET
            status = $1,
            current_step_id = $2,
            variables = $3,
            completed_steps = $4,
            errors = $5,
            updated_at = CURRENT_TIMESTAMP,
            completed_at = $6,
            heartbeat_at = $7,
            version = version + 1
          WHERE execution_id = $8 AND tenant_id = $9 AND workspace_id = $10 AND version = $11
        `;
        const updateValues = [
          execution.status,
          execution.currentStepId,
          JSON.stringify(cleanVariables),
          JSON.stringify(cleanCompletedSteps),
          JSON.stringify(cleanErrors),
          completedAt,
          heartbeatAt,
          execution.executionId,
          tenantId,
          workspaceId,
          currentVersion
        ];

        const updateRes = await this.pool!.query(updateSql, updateValues);
        if (updateRes.rowCount === 0) {
          throw new Error(`Optimistic concurrency violation: version mismatch for execution "${execution.executionId}".`);
        }
      }
    } catch (err) {
      console.error(`[PostgresWorkflowPersistenceStore] saveExecution failed for execution ${execution.executionId}:`, err);
      throw err;
    }
  }

  public async getExecution(
    executionId: string,
    tenantId: string = 'default',
    workspaceId: string = 'default'
  ): Promise<WorkflowExecution | null> {
    this.ensureConnected();
    if (this.fallback) {
      return this.fallback.getExecution(executionId);
    }

    try {
      const sql = 'SELECT * FROM workflow_executions WHERE execution_id = $1 AND tenant_id = $2 AND workspace_id = $3';
      const res = await this.pool!.query(sql, [executionId, tenantId, workspaceId]);
      if (res.rows.length === 0) return null;

      const row = res.rows[0];
      return {
        executionId: row.execution_id,
        workflowId: row.workflow_id,
        workflowVersion: row.workflow_version,
        status: row.status as any,
        currentStepId: row.current_step_id,
        variables: typeof row.variables === 'string' ? JSON.parse(row.variables) : row.variables,
        completedSteps: typeof row.completed_steps === 'string' ? JSON.parse(row.completed_steps) : row.completed_steps,
        errors: typeof row.errors === 'string' ? JSON.parse(row.errors) : row.errors,
        startTime: row.started_at ? new Date(row.started_at).toISOString() : new Date().toISOString(),
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
      };
    } catch (err) {
      console.error(`[PostgresWorkflowPersistenceStore] getExecution failed for ${executionId}:`, err);
      throw err;
    }
  }

  public async deleteExecution(
    executionId: string,
    tenantId: string = 'default',
    workspaceId: string = 'default'
  ): Promise<void> {
    this.ensureConnected();
    if (this.fallback) {
      return this.fallback.deleteExecution(executionId);
    }

    try {
      const sql = 'DELETE FROM workflow_executions WHERE execution_id = $1 AND tenant_id = $2 AND workspace_id = $3';
      await this.pool!.query(sql, [executionId, tenantId, workspaceId]);
    } catch (err) {
      console.error(`[PostgresWorkflowPersistenceStore] deleteExecution failed for ${executionId}:`, err);
      throw err;
    }
  }

  public async clear(): Promise<void> {
    this.ensureConnected();
    if (this.fallback) {
      this.fallback.clear();
      return;
    }
    await this.pool!.query('DELETE FROM workflow_executions');
  }

  public async dispose(): Promise<void> {
    if (this.pool) {
      await this.pool.end().catch(() => {});
    }
  }

  private redactSecrets(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    const result = Array.isArray(obj) ? [] : {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('secret') ||
        lowerKey.includes('key') ||
        lowerKey.includes('token') ||
        lowerKey.includes('password') ||
        lowerKey.includes('authorization') ||
        lowerKey.includes('auth')
      ) {
        (result as any)[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        (result as any)[key] = this.redactSecrets(value);
      } else {
        (result as any)[key] = value;
      }
    }
    return result;
  }
}
