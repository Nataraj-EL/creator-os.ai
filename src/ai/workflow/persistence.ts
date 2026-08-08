import { WorkflowExecution } from './types';

export interface WorkflowPersistenceStore {
  saveExecution(execution: WorkflowExecution): Promise<void>;
  getExecution(executionId: string, tenantId?: string, workspaceId?: string): Promise<WorkflowExecution | null>;
  deleteExecution(executionId: string, tenantId?: string, workspaceId?: string): Promise<void>;
}

export class InMemoryWorkflowPersistenceStore implements WorkflowPersistenceStore {
  private executions: Map<string, WorkflowExecution> = new Map();

  public async saveExecution(execution: WorkflowExecution): Promise<void> {
    const tenantId = execution.variables?.tenantId || 'default';
    const workspaceId = execution.variables?.workspaceId || 'default';
    if (!tenantId || tenantId === 'default' || !workspaceId || workspaceId === 'default') {
      throw new Error("Missing or unauthorized tenant/workspace context in workflow variables.");
    }
    const key = `${tenantId}:${workspaceId}:${execution.executionId}`;
    this.executions.set(key, JSON.parse(JSON.stringify(execution)));
  }

  public async getExecution(
    executionId: string,
    tenantId: string = 'default',
    workspaceId: string = 'default'
  ): Promise<WorkflowExecution | null> {
    if (!tenantId || tenantId === 'default' || !workspaceId || workspaceId === 'default') {
      throw new Error("Missing or unauthorized tenant/workspace context.");
    }
    const key = `${tenantId}:${workspaceId}:${executionId}`;
    const exec = this.executions.get(key);
    return exec ? JSON.parse(JSON.stringify(exec)) : null;
  }

  public async deleteExecution(
    executionId: string,
    tenantId: string = 'default',
    workspaceId: string = 'default'
  ): Promise<void> {
    if (!tenantId || tenantId === 'default' || !workspaceId || workspaceId === 'default') {
      throw new Error("Missing or unauthorized tenant/workspace context.");
    }
    const key = `${tenantId}:${workspaceId}:${executionId}`;
    this.executions.delete(key);
  }

  public clear(): void {
    this.executions.clear();
  }
}
