import { AgentAction, AgentContext } from '../types';

export interface NodeResult {
  status: 'SUCCESS' | 'FAILED';
  output?: any;
  metadata?: Record<string, any>;
}

export interface AgentNode {
  id: string;
  action: AgentAction;
  metadata?: Record<string, any>;
  requiresHumanApproval?: boolean;
  approvalPolicy?: {
    policyType: 'SINGLE_APPROVER' | 'ANY_APPROVER' | 'ALL_APPROVERS' | 'TIMEOUT';
    config?: Record<string, any>;
  };
}

export type GraphCondition = (result: NodeResult) => Promise<boolean> | boolean;

export interface AgentEdge {
  sourceNodeId: string;
  targetNodeId: string;
  label?: 'success' | 'failure' | 'retry' | 'fallback';
  condition?: GraphCondition;
}

export interface AgentGraph {
  startNodeId: string;
  nodes: Record<string, AgentNode>;
  edges: AgentEdge[];
}

export type GraphExecutionStatus = 'RUNNING' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';

export interface GraphExecutionMetrics {
  nodesExecuted: number;
  transitionsTaken: number;
  duration: number;
  maxDepth: number;
  loopCount: number;
}

export interface GraphExecutionState {
  currentNodeId: string;
  status: GraphExecutionStatus;
  metrics: GraphExecutionMetrics;
}

export type GraphLifecycleEventType =
  | 'GRAPH_STARTED'
  | 'NODE_STARTED'
  | 'NODE_COMPLETED'
  | 'NODE_FAILED'
  | 'TRANSITION_TAKEN'
  | 'GRAPH_COMPLETED'
  | 'GRAPH_LOOP_DETECTED'
  | 'GRAPH_ITERATIONS_EXCEEDED';

export interface GraphLifecycleEvent {
  type: GraphLifecycleEventType;
  requestId: string;
  traceId: string;
  timestamp: string;
  nodeId?: string;
  targetNodeId?: string;
  metrics?: GraphExecutionMetrics;
  details?: Record<string, any>;
}

export type GraphLifecycleListener = (event: GraphLifecycleEvent) => void;
