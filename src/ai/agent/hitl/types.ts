import { AgentContext } from '../types';
import { GraphExecutionState } from '../graph/types';

export type CheckpointStatus = 
  | 'WAITING' 
  | 'APPROVED' 
  | 'REJECTED' 
  | 'CANCELLED' 
  | 'EXPIRED' 
  | 'RESUMED';

export type ApprovalPolicyType = 
  | 'SINGLE_APPROVER' 
  | 'ANY_APPROVER' 
  | 'ALL_APPROVERS' 
  | 'TIMEOUT';

export interface ApprovalPolicy {
  policyType: ApprovalPolicyType;
  config?: Record<string, any>;
}

export interface HumanTask {
  id: string;
  instruction: string;
  metadata?: Record<string, any>;
}

export interface HumanDecision {
  decisionType: 'APPROVE' | 'REJECT' | 'EDIT' | 'CANCEL';
  editedOutput?: any;
  reason?: string;
  approverId?: string;
}

export interface Checkpoint {
  checkpointId: string;
  resumeToken: string;
  graphState: GraphExecutionState;
  agentContext: AgentContext;
  status: CheckpointStatus;
  policy?: ApprovalPolicy;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ResumeRequest {
  checkpointId: string;
  resumeToken: string;
  decision: HumanDecision;
}

export type HITLStageType = 
  | 'CHECKPOINT_CREATED'
  | 'DECISION_RECEIVED'
  | 'RESUMED_FROM_CHECKPOINT'
  | 'CHECKPOINT_CANCELLED'
  | 'CHECKPOINT_EXPIRED';

export interface HITLEvent {
  type: HITLStageType;
  checkpointId: string;
  traceId: string;
  requestId: string;
  timestamp: string;
  status: CheckpointStatus;
  details?: Record<string, any>;
}

export type HITLEventListener = (event: HITLEvent) => void;
