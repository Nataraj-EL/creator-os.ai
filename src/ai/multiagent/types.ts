import { AgentServices, AgentRuntime } from '../agent';

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  capabilities: string[];
  version: string;
}

export interface AgentRegistryEntry {
  profile: AgentProfile;
  services: AgentServices;
  runtime: AgentRuntime;
  enabled: boolean;
  version: string;
}

export interface AgentTask {
  id: string;
  agentId: string;
  description: string;
  dependencies?: string[]; // IDs of tasks that must execute before this task
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  input?: any;
  output?: any;
  error?: string;
}

export interface AgentMessage {
  messageId: string;
  senderId: string;
  recipientId: string;
  content: any;
  timestamp: string;
  traceId: string;
}

export interface GraphPolicy {
  timeout?: number;
  maxRetries?: number;
  failFast?: boolean;
}

export interface WorkflowResult {
  outputs: Record<string, any>;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  latency: number;
  participatingAgents: string[];
  errors: Record<string, string>;
  traceId: string;
}

export type CoordinatorLifecycleEventType =
  | 'WORKFLOW_STARTED'
  | 'TASK_ASSIGNED'
  | 'TASK_COMPLETED'
  | 'TASK_FAILED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED';

export interface AgentCoordinatorEvent {
  type: CoordinatorLifecycleEventType;
  traceId: string;
  timestamp: string;
  taskId?: string;
  agentId?: string;
  details?: Record<string, any>;
}

export type AgentCoordinatorListener = (event: AgentCoordinatorEvent) => void;
