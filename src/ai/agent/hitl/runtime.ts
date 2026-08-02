import { AgentContext } from '../types';
import { GraphExecutionState } from '../graph/types';
import { 
  Checkpoint, 
  CheckpointStatus, 
  ApprovalPolicy, 
  ResumeRequest, 
  HITLEvent, 
  HITLStageType, 
  HITLEventListener 
} from './types';

export class HITLRuntime {
  private checkpoints: Map<string, Checkpoint> = new Map();
  private listeners: Set<HITLEventListener> = new Set();

  public addListener(listener: HITLEventListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: HITLEventListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(
    type: HITLStageType,
    checkpoint: Checkpoint,
    details?: Record<string, any>
  ): void {
    const event: HITLEvent = {
      type,
      checkpointId: checkpoint.checkpointId,
      traceId: checkpoint.agentContext.traceId,
      requestId: checkpoint.agentContext.requestId,
      timestamp: new Date().toISOString(),
      status: checkpoint.status,
      details
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[HITLRuntime] Callback listener failed:", err);
      }
    }
  }

  public createCheckpoint(
    graphState: GraphExecutionState,
    agentContext: AgentContext,
    policy?: ApprovalPolicy
  ): Checkpoint {
    const checkpointId = `chk-${Math.random().toString(36).substring(2, 10)}`;
    const resumeToken = `tok-${Math.random().toString(36).substring(2, 10)}`;

    const checkpoint: Checkpoint = {
      checkpointId,
      resumeToken,
      graphState: {
        currentNodeId: graphState.currentNodeId,
        status: 'PAUSED',
        metrics: { ...graphState.metrics }
      },
      agentContext: {
        ...agentContext,
        variables: { ...agentContext.variables },
        retrievedMemories: [...agentContext.retrievedMemories],
        toolOutputs: [...agentContext.toolOutputs],
        evaluationResults: [...agentContext.evaluationResults]
      },
      status: 'WAITING',
      policy,
      timestamp: new Date().toISOString()
    };

    this.checkpoints.set(checkpointId, checkpoint);
    this.emitEvent('CHECKPOINT_CREATED', checkpoint);

    return checkpoint;
  }

  public resumeCheckpoint(request: ResumeRequest): Checkpoint {
    const checkpoint = this.checkpoints.get(request.checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint with ID "${request.checkpointId}" not found.`);
    }

    if (checkpoint.resumeToken !== request.resumeToken) {
      throw new Error(`Invalid resume token.`);
    }

    if (checkpoint.status !== 'WAITING') {
      throw new Error(`Checkpoint is not in WAITING status (current: ${checkpoint.status}).`);
    }

    const decision = request.decision;
    let nextStatus: CheckpointStatus;

    switch (decision.decisionType) {
      case 'APPROVE':
        nextStatus = 'APPROVED';
        break;
      case 'REJECT':
        nextStatus = 'REJECTED';
        break;
      case 'CANCEL':
        nextStatus = 'CANCELLED';
        break;
      case 'EDIT':
        nextStatus = 'APPROVED';
        break;
      default:
        throw new Error(`Unsupported decision type: ${decision.decisionType}`);
    }

    checkpoint.status = nextStatus;
    this.emitEvent('DECISION_RECEIVED', checkpoint, { decision });

    checkpoint.status = 'RESUMED';
    this.emitEvent('RESUMED_FROM_CHECKPOINT', checkpoint);

    return checkpoint;
  }

  public getCheckpoint(checkpointId: string): Checkpoint | undefined {
    return this.checkpoints.get(checkpointId);
  }

  public cancelCheckpoint(checkpointId: string): void {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (checkpoint && checkpoint.status === 'WAITING') {
      checkpoint.status = 'CANCELLED';
      this.emitEvent('CHECKPOINT_CANCELLED', checkpoint);
    }
  }
}
