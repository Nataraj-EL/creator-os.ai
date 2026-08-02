import { AgentRegistry } from './registry';
import { MessageBus } from './messagebus';
import { TaskScheduler } from './scheduler';
import { 
  AgentTask, 
  WorkflowResult, 
  GraphPolicy, 
  AgentCoordinatorEvent, 
  CoordinatorLifecycleEventType, 
  AgentCoordinatorListener 
} from './types';

export class MultiAgentRuntime {
  private listeners: Set<AgentCoordinatorListener> = new Set();
  private scheduler = new TaskScheduler();

  constructor(
    private registry: AgentRegistry,
    private messageBus: MessageBus
  ) {}

  public addListener(listener: AgentCoordinatorListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: AgentCoordinatorListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(
    type: CoordinatorLifecycleEventType,
    traceId: string,
    taskId?: string,
    agentId?: string,
    details?: Record<string, any>
  ): void {
    const event: AgentCoordinatorEvent = {
      type,
      traceId,
      timestamp: new Date().toISOString(),
      taskId,
      agentId,
      details
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[MultiAgentRuntime] Callback listener failed:", err);
      }
    }
  }

  public async execute(
    tasks: AgentTask[],
    policy?: GraphPolicy,
    traceId?: string
  ): Promise<WorkflowResult> {
    const startTime = Date.now();
    const currentTraceId = traceId || `trace-multi-${Math.random().toString(36).substring(7)}`;
    const failFast = policy?.failFast ?? true;
    const maxRetries = policy?.maxRetries ?? 0;
    const timeoutMs = policy?.timeout ?? 0;

    this.emitEvent('WORKFLOW_STARTED', currentTraceId);

    const outputs: Record<string, any> = {};
    const errors: Record<string, string> = {};
    const participatingAgents = new Set<string>();

    let workflowStatus: 'COMPLETED' | 'FAILED' | 'CANCELLED' = 'COMPLETED';

    try {
      const layers = this.scheduler.schedule(tasks);

      for (const layer of layers) {
        const promises = layer.map(async (task) => {
          participatingAgents.add(task.agentId);
          task.status = 'RUNNING';
          this.emitEvent('TASK_ASSIGNED', currentTraceId, task.id, task.agentId);

          const depOutputs: Record<string, any> = {};
          if (task.dependencies) {
            const history = this.messageBus.getHistory(currentTraceId);
            for (const depId of task.dependencies) {
              const resultMsg = history.find(m => m.senderId === tasks.find(t => t.id === depId)?.agentId);
              if (resultMsg) {
                depOutputs[depId] = resultMsg.content;
              }
            }
          }
          task.input = { ...task.input, ...depOutputs };

          this.messageBus.publish({
            messageId: `msg-start-${task.id}`,
            senderId: 'coordinator',
            recipientId: task.agentId,
            content: task.input,
            timestamp: new Date().toISOString(),
            traceId: currentTraceId
          });

          let attempt = 0;
          let success = false;
          let lastErrorMsg = '';
          let outputData: any = null;

          while (attempt <= maxRetries && !success) {
            try {
              const executionPromise = (async () => {
                const entry = this.registry.resolve(task.agentId);
                if (!entry.enabled) {
                  throw new Error(`Agent "${task.agentId}" is currently disabled.`);
                }
                const agentRes = await entry.runtime.run({
                  requestId: `task-${task.id}-attempt-${attempt}`,
                  traceId: currentTraceId,
                  creatorId: 'multi-agent-system',
                  workspaceId: 'multi-agent-workspace',
                  prompt: task.description,
                  metadata: { input: task.input }
                });
                if (!agentRes.success) {
                  throw new Error(agentRes.error || 'Agent execution failed');
                }
                return agentRes.output;
              })();

              if (timeoutMs > 0) {
                const timeoutPromise = new Promise<never>((_, reject) => {
                  setTimeout(() => reject(new Error(`Timeout of ${timeoutMs}ms exceeded`)), timeoutMs);
                });
                outputData = await Promise.race([executionPromise, timeoutPromise]);
              } else {
                outputData = await executionPromise;
              }

              success = true;
            } catch (err: any) {
              attempt++;
              lastErrorMsg = err.message || 'Unknown execution error';
            }
          }

          if (success) {
            task.status = 'COMPLETED';
            task.output = outputData;
            outputs[task.id] = outputData;

            this.messageBus.publish({
              messageId: `msg-output-${task.id}`,
              senderId: task.agentId,
              recipientId: 'coordinator',
              content: outputData,
              timestamp: new Date().toISOString(),
              traceId: currentTraceId
            });

            this.emitEvent('TASK_COMPLETED', currentTraceId, task.id, task.agentId, { output: outputData });
          } else {
            task.status = 'FAILED';
            task.error = lastErrorMsg;
            errors[task.id] = lastErrorMsg;

            this.emitEvent('TASK_FAILED', currentTraceId, task.id, task.agentId, { error: lastErrorMsg });

            if (failFast) {
              throw new Error(`Task "${task.id}" failed: ${lastErrorMsg}`);
            }
          }
        });

        await Promise.all(promises);
      }
    } catch (err: any) {
      workflowStatus = 'FAILED';
      this.emitEvent('WORKFLOW_FAILED', currentTraceId, undefined, undefined, { error: err.message });
    }

    if (workflowStatus === 'COMPLETED') {
      this.emitEvent('WORKFLOW_COMPLETED', currentTraceId);
    }

    return {
      outputs,
      status: workflowStatus,
      latency: Date.now() - startTime,
      participatingAgents: Array.from(participatingAgents),
      errors,
      traceId: currentTraceId
    };
  }
}
