import { AgentPlanner } from './planner';
import { 
  AgentServices, 
  AgentRequest, 
  AgentResponse, 
  AgentState, 
  AgentStep, 
  AgentContext, 
  AgentLifecycleEvent, 
  AgentLifecycleEventType, 
  AgentLifecycleListener 
} from './types';

export class AgentRuntime {
  private listeners: Set<AgentLifecycleListener> = new Set();

  constructor(
    private planner: AgentPlanner,
    private services: AgentServices
  ) {}

  public addListener(listener: AgentLifecycleListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: AgentLifecycleListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(
    type: AgentLifecycleEventType,
    request: AgentRequest,
    stepId?: string,
    actionType?: string,
    details?: Record<string, any>
  ): void {
    const event: AgentLifecycleEvent = {
      type,
      requestId: request.requestId,
      traceId: request.traceId,
      timestamp: new Date().toISOString(),
      stepId,
      actionType,
      details
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[AgentRuntime] Callback listener failed:", err);
      }
    }
  }

  public async run(request: AgentRequest): Promise<AgentResponse> {
    this.emitEvent('AGENT_STARTED', request);

    const plan = this.planner.plan(request);
    const context: AgentContext = {
      request,
      variables: {},
      retrievedMemories: [],
      toolOutputs: [],
      evaluationResults: [],
      traceId: request.traceId,
      requestId: request.requestId
    };

    const state: AgentState = {
      plan,
      currentStepIndex: 0,
      status: 'running'
    };

    try {
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        state.currentStepIndex = i;
        step.status = 'RUNNING';
        step.startedAt = new Date().toISOString();

        this.emitEvent('AGENT_STEP_STARTED', request, step.id, step.action.actionType);

        try {
          const output = await this.executeAction(step.action, context);
          step.status = 'COMPLETED';
          step.output = output;
          step.completedAt = new Date().toISOString();

          this.emitEvent('AGENT_STEP_COMPLETED', request, step.id, step.action.actionType, { output });
        } catch (err: any) {
          step.status = 'FAILED';
          step.error = err.message || 'Action execution failed.';
          step.completedAt = new Date().toISOString();

          this.emitEvent('AGENT_STEP_FAILED', request, step.id, step.action.actionType, { error: step.error });
          
          // Fail-open strategy: Continue execution of subsequent steps on fail
        }
      }

      state.status = 'completed';
      const finalOutput = context.variables.generatedText || 'Agent loop completed.';
      this.emitEvent('AGENT_COMPLETED', request, undefined, undefined, { finalOutput });

      return {
        success: true,
        state,
        context,
        output: finalOutput
      };
    } catch (err: any) {
      state.status = 'failed';
      this.emitEvent('AGENT_FAILED', request, undefined, undefined, { error: err.message });
      return {
        success: false,
        state,
        context,
        error: err.message || 'Agent reasoning loop crashed.'
      };
    }
  }

  private async executeAction(action: any, context: AgentContext): Promise<any> {
    const payload = action.payload || {};
    switch (action.actionType) {
      case 'RETRIEVE_MEMORY': {
        const queryText = payload.text || context.request.prompt;
        const results = await this.services.retrievalService.semanticSearch({
          text: queryText,
          creatorId: context.request.creatorId,
          topK: 3,
          metadataFilters: { traceId: context.traceId, requestId: context.requestId }
        });
        context.retrievedMemories.push(...results);
        context.variables.retrievedMemory = results;
        return results;
      }

      case 'GENERATE': {
        const provider = this.services.providerResolver.resolve('mock');
        const res = await provider.generate({
          prompt: payload.prompt || context.request.prompt,
          model: 'mock-model',
          metadata: { requestId: context.requestId, traceId: context.traceId }
        });
        context.variables.generatedText = res.content;
        return res.content;
      }

      case 'CALL_TOOL': {
        const res = await this.services.toolRuntime.execute({
          toolName: payload.toolName || 'fetch_weather',
          arguments: payload.arguments || { location: 'New York' },
          context: {
            requestId: context.requestId,
            traceId: context.traceId,
            creatorId: context.request.creatorId,
            workspaceId: context.request.workspaceId
          }
        });
        context.toolOutputs.push(res);
        context.variables.toolCallResult = res;
        return res;
      }

      case 'STREAM': {
        const session = this.services.streamRuntime.createSession({
          prompt: payload.prompt || context.request.prompt,
          provider: 'mock',
          metadata: { traceId: context.traceId, requestId: context.requestId }
        });
        await session.start();
        return 'Stream completed.';
      }

      case 'EVALUATE': {
        const text = context.variables.generatedText || context.request.prompt;
        const res = await this.services.evaluationService.evaluate({
          requestId: context.requestId,
          creatorId: context.request.creatorId,
          prompt: context.request.prompt,
          response: text,
          context: { metadata: { traceId: context.traceId } }
        } as any);
        context.evaluationResults.push(res);
        context.variables.evaluationResult = res;
        return res;
      }

      case 'STORE_MEMORY': {
        const text = context.variables.generatedText || context.request.prompt;
        const res = await this.services.memoryLearningService.learn(
          {
            userId: context.request.creatorId,
            requestId: context.requestId,
            traceId: context.traceId,
            sessionId: context.request.sessionId || 'session-agent'
          } as any,
          context.request.prompt,
          text
        );
        context.variables.storedMemory = res;
        return res;
      }

      case 'COMPLETE':
        return context.variables.generatedText || 'Success';

      default:
        // extensible fallback checks (THINK, REPLAN, REFLECT, WAIT_FOR_USER)
        return `Action ${action.actionType} processed (extensible fallback).`;
    }
  }
}
