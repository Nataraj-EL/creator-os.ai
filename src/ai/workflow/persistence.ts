import { WorkflowExecution } from './types';

export interface WorkflowPersistenceStore {
  saveExecution(execution: WorkflowExecution): Promise<void>;
  getExecution(executionId: string): Promise<WorkflowExecution | null>;
  deleteExecution(executionId: string): Promise<void>;
}

export class InMemoryWorkflowPersistenceStore implements WorkflowPersistenceStore {
  private executions: Map<string, WorkflowExecution> = new Map();

  public async saveExecution(execution: WorkflowExecution): Promise<void> {
    this.executions.set(execution.executionId, JSON.parse(JSON.stringify(execution)));
  }

  public async getExecution(executionId: string): Promise<WorkflowExecution | null> {
    const exec = this.executions.get(executionId);
    return exec ? JSON.parse(JSON.stringify(exec)) : null;
  }

  public async deleteExecution(executionId: string): Promise<void> {
    this.executions.delete(executionId);
  }

  public clear(): void {
    this.executions.clear();
  }
}
