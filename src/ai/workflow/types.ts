export interface WorkflowStep {
  id: string;
  name: string;
  type: 'START' | 'AGENT' | 'TOOL' | 'HUMAN' | 'CONDITION' | 'PARALLEL' | 'DELAY' | 'END';
  payload: any; // Configuration payload for the step
  nextStepId?: string;
  nextStepIds?: string[]; // Used for Parallel fork steps
  conditions?: Record<string, string>; // e.g. { "success": "step-2", "failure": "step-3" }
}

export type TriggerType = 'MANUAL' | 'SCHEDULE' | 'EVENT' | 'WEBHOOK';

export interface WorkflowTrigger {
  type: TriggerType;
  config: Record<string, any>;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  trigger: WorkflowTrigger;
  steps: Record<string, WorkflowStep>;
  startStepId: string;
}

export interface WorkflowExecution {
  executionId: string;
  workflowId: string;
  workflowVersion: string;
  status: 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  currentStepId: string;
  variables: Record<string, any>;
  completedSteps: Record<string, any>; // maps step ID to output data
  errors: Record<string, string>; // maps step ID to error messages
  startTime: string;
  updatedAt: string;
  duration?: number;
}

export interface WorkflowExecutionPolicy {
  timeout?: number;
  maxRetries?: number;
  continueOnError?: boolean;
  failFast?: boolean;
}

export type WorkflowEventType =
  | 'WORKFLOW_STARTED'
  | 'STEP_STARTED'
  | 'STEP_COMPLETED'
  | 'STEP_FAILED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED'
  | 'WORKFLOW_PAUSED'
  | 'WORKFLOW_RESUMED';

export interface WorkflowEvent {
  type: WorkflowEventType;
  executionId: string;
  workflowId: string;
  timestamp: string;
  stepId?: string;
  details?: Record<string, any>;
}

export type WorkflowListener = (event: WorkflowEvent) => void;
