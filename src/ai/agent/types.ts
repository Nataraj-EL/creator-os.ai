import { ProviderResolver } from '../providers';
import { StreamRuntime } from '../streaming';
import { ToolRuntime } from '../tools';
import { RetrievalService } from '../retrieval';
import { MemoryLearningService } from '../memory/extraction/types';
import { EvaluationService } from '../evaluation/types';

export interface AgentRequest {
  requestId: string;
  traceId: string;
  creatorId: string;
  workspaceId: string;
  sessionId?: string;
  prompt: string;
  metadata?: Record<string, any>;
  signal?: AbortSignal;
}

export interface AgentAction {
  actionType: string; // e.g. 'GENERATE', 'RETRIEVE_MEMORY', 'CALL_TOOL', 'STORE_MEMORY', 'EVALUATE', 'COMPLETE', 'THINK', etc.
  payload: Record<string, any>;
}

export interface AgentStep {
  id: string;
  action: AgentAction;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  output?: any;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentPlan {
  steps: AgentStep[];
}

export interface AgentContext {
  request: AgentRequest;
  variables: Record<string, any>;
  retrievedMemories: any[];
  toolOutputs: any[];
  evaluationResults: any[];
  traceId: string;
  requestId: string;
}

export interface AgentServices {
  providerResolver: ProviderResolver;
  retrievalService: RetrievalService;
  toolRuntime: ToolRuntime;
  streamRuntime: StreamRuntime;
  evaluationService: EvaluationService;
  memoryLearningService: MemoryLearningService;
}

export interface AgentState {
  plan: AgentPlan;
  currentStepIndex: number;
  status: 'idle' | 'running' | 'completed' | 'failed';
}

export interface AgentResponse {
  success: boolean;
  state: AgentState;
  context: AgentContext;
  output?: any;
  error?: string;
}

export type AgentLifecycleEventType =
  | 'AGENT_STARTED'
  | 'AGENT_STEP_STARTED'
  | 'AGENT_STEP_COMPLETED'
  | 'AGENT_STEP_FAILED'
  | 'AGENT_COMPLETED'
  | 'AGENT_FAILED';

export interface AgentLifecycleEvent {
  type: AgentLifecycleEventType;
  requestId: string;
  traceId: string;
  timestamp: string;
  stepId?: string;
  actionType?: string;
  details?: Record<string, any>;
}

export type AgentLifecycleListener = (event: AgentLifecycleEvent) => void;
