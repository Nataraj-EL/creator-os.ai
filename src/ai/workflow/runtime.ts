import { 
  WorkflowDefinition, 
  WorkflowStep,
  WorkflowExecution, 
  WorkflowExecutionPolicy, 
  WorkflowEvent, 
  WorkflowEventType, 
  WorkflowListener 
} from './types';
import { WorkflowRegistry } from './registry';
import { WorkflowPersistenceStore } from './persistence';
import { StepExecutorRegistry, StepExecutionContext } from './executors';
import { WorkflowVariables } from './variables';
import { featureFlags } from './config/featureFlags';
import { traceEventBus } from '../observability';

export class WorkflowRuntime {
  private listeners: Set<WorkflowListener> = new Set();

  constructor(
    private registry: WorkflowRegistry,
    private persistenceStore: WorkflowPersistenceStore,
    private executorRegistry: StepExecutorRegistry,
    private services: Record<string, any>
  ) {}

  public addListener(listener: WorkflowListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: WorkflowListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(
    type: WorkflowEventType,
    executionId: string,
    workflowId: string,
    stepId?: string,
    details?: Record<string, any>
  ): void {
    const event: WorkflowEvent = {
      type,
      executionId,
      workflowId,
      timestamp: new Date().toISOString(),
      stepId,
      details
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[WorkflowRuntime] Listener failed:", err);
      }
    }

    try {
      const statusMap: Record<string, 'started' | 'completed' | 'failed'> = {
        'WORKFLOW_STARTED': 'started',
        'WORKFLOW_COMPLETED': 'completed',
        'WORKFLOW_FAILED': 'failed',
        'STEP_STARTED': 'started',
        'STEP_COMPLETED': 'completed',
        'STEP_FAILED': 'failed',
        'WORKFLOW_PAUSED': 'completed',
        'WORKFLOW_RESUMED': 'started'
      };
      
      const status = statusMap[type] || 'completed';
      
      traceEventBus.publish({
        traceId: executionId,
        requestId: executionId,
        stage: 'workflow',
        component: stepId ? `WorkflowStep:${stepId}` : `Workflow:${workflowId}`,
        status,
        metadata: {
          workflowId,
          stepId,
          eventType: type,
          ...details
        }
      });
    } catch {
      // fail-open
    }
  }

  public async executeWorkflow(
    workflowId: string,
    inputVariables?: Record<string, any>,
    policy?: WorkflowExecutionPolicy,
    version?: string
  ): Promise<WorkflowExecution> {
    const definition = this.registry.resolve(workflowId, version);
    const executionId = `exec-${Math.random().toString(36).substring(7)}`;

    const execution: WorkflowExecution = {
      executionId,
      workflowId,
      workflowVersion: definition.version,
      status: 'RUNNING',
      currentStepId: definition.startStepId,
      variables: inputVariables || {},
      completedSteps: {},
      errors: {},
      startTime: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (featureFlags.WORKFLOW_PERSISTENCE) {
      await this.persistenceStore.saveExecution(execution);
    }

    this.emitEvent('WORKFLOW_STARTED', executionId, workflowId);

    return this.runExecutionLoop(definition, execution, policy);
  }

  public async resumeWorkflow(
    executionId: string,
    resumePayload?: any,
    policy?: WorkflowExecutionPolicy
  ): Promise<WorkflowExecution> {
    const execution = await this.persistenceStore.getExecution(executionId);
    if (!execution) {
      throw new Error(`Execution "${executionId}" not found for resumption.`);
    }

    if (execution.status !== 'PAUSED') {
      throw new Error(`Execution "${executionId}" is not in PAUSED status (current: ${execution.status}).`);
    }

    const definition = this.registry.resolve(execution.workflowId, execution.workflowVersion);

    execution.status = 'RUNNING';
    execution.updatedAt = new Date().toISOString();

    this.emitEvent('WORKFLOW_RESUMED', executionId, execution.workflowId, undefined, { resumePayload });

    return this.runExecutionLoop(definition, execution, policy, resumePayload);
  }

  private async runExecutionLoop(
    definition: WorkflowDefinition,
    execution: WorkflowExecution,
    policy?: WorkflowExecutionPolicy,
    resumePayload?: any
  ): Promise<WorkflowExecution> {
    const variables = new WorkflowVariables(execution.variables);
    const failFast = policy?.failFast ?? true;
    const maxRetries = policy?.maxRetries ?? 0;
    const timeoutMs = policy?.timeout ?? 0;

    let currentStepId = execution.currentStepId;
    let nextStepIdToRun: string | undefined = currentStepId;

    try {
      while (nextStepIdToRun) {
        const step: WorkflowStep = definition.steps[nextStepIdToRun];
        if (!step) {
          throw new Error(`Step ID "${nextStepIdToRun}" not found in definition.`);
        }

        execution.currentStepId = nextStepIdToRun;
        execution.updatedAt = new Date().toISOString();
        if (featureFlags.WORKFLOW_PERSISTENCE) {
          await this.persistenceStore.saveExecution(execution);
        }

        this.emitEvent('STEP_STARTED', execution.executionId, definition.id, step.id);

        const executor = this.executorRegistry.resolve(step.type);
        const stepCtx: StepExecutionContext = {
          executionId: execution.executionId,
          workflowId: definition.id,
          services: this.services,
          resumePayload: nextStepIdToRun === currentStepId ? resumePayload : undefined
        };

        let attempt = 0;
        let success = false;
        let lastErrorMsg = '';
        let stepResult: any = null;

        while (attempt <= maxRetries && !success) {
          try {
            const stepPromise = executor.execute(step, variables, stepCtx);
            if (timeoutMs > 0) {
              const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error(`Timeout of ${timeoutMs}ms exceeded`)), timeoutMs);
              });
              stepResult = await Promise.race([stepPromise, timeoutPromise]);
            } else {
              stepResult = await stepPromise;
            }
            success = true;
          } catch (err: any) {
            attempt++;
            lastErrorMsg = err.message || 'Step execution error';
          }
        }

        if (success) {
          if (stepResult && stepResult.suspend) {
            execution.status = 'PAUSED';
            execution.variables = variables.getAll();
            execution.updatedAt = new Date().toISOString();
            if (featureFlags.WORKFLOW_PERSISTENCE) {
              await this.persistenceStore.saveExecution(execution);
            }
            this.emitEvent('WORKFLOW_PAUSED', execution.executionId, definition.id, step.id);
            return execution;
          }

          if (stepResult && stepResult.parallel && stepResult.branches) {
            const branches: string[] = stepResult.branches;
            if (featureFlags.WORKFLOW_PARALLEL) {
              const branchPromises = branches.map(branchStepId => {
                const subExecution = { ...execution, currentStepId: branchStepId };
                return this.runExecutionLoop(definition, subExecution, policy);
              });
              const branchExecs = await Promise.all(branchPromises);
              for (const be of branchExecs) {
                execution.variables = { ...execution.variables, ...be.variables };
                execution.completedSteps = { ...execution.completedSteps, ...be.completedSteps };
                execution.errors = { ...execution.errors, ...be.errors };
              }
            } else {
              for (const branchStepId of branches) {
                const subExecution = { ...execution, currentStepId: branchStepId };
                const be = await this.runExecutionLoop(definition, subExecution, policy);
                execution.variables = { ...execution.variables, ...be.variables };
                execution.completedSteps = { ...execution.completedSteps, ...be.completedSteps };
                execution.errors = { ...execution.errors, ...be.errors };
              }
            }

            nextStepIdToRun = step.nextStepId;
            continue;
          }

          execution.completedSteps[step.id] = stepResult?.output || { success: true };
          this.emitEvent('STEP_COMPLETED', execution.executionId, definition.id, step.id, { result: stepResult });

          if (stepResult && stepResult.nextStepId) {
            nextStepIdToRun = stepResult.nextStepId;
          } else if (stepResult && stepResult.completed) {
            nextStepIdToRun = undefined;
          } else {
            nextStepIdToRun = step.nextStepId;
          }
        } else {
          execution.errors[step.id] = lastErrorMsg;
          this.emitEvent('STEP_FAILED', execution.executionId, definition.id, step.id, { error: lastErrorMsg });

          if (failFast) {
            throw new Error(`Step "${step.id}" failed: ${lastErrorMsg}`);
          }

          if (policy?.continueOnError) {
            nextStepIdToRun = step.nextStepId;
          } else {
            nextStepIdToRun = undefined;
            execution.status = 'FAILED';
          }
        }
      }

      if (execution.status === 'RUNNING') {
        execution.status = 'COMPLETED';
      }
    } catch (err: any) {
      execution.status = 'FAILED';
      this.emitEvent('WORKFLOW_FAILED', execution.executionId, definition.id, undefined, { error: err.message });
    }

    execution.variables = variables.getAll();
    execution.updatedAt = new Date().toISOString();
    execution.duration = Date.now() - new Date(execution.startTime).getTime();

    if (featureFlags.WORKFLOW_PERSISTENCE) {
      await this.persistenceStore.saveExecution(execution);
    }

    if (execution.status === 'COMPLETED') {
      this.emitEvent('WORKFLOW_COMPLETED', execution.executionId, definition.id);
    }

    return execution;
  }
}
