import { AgentServices, AgentContext, AgentAction } from '../types';
import { 
  AgentGraph, 
  AgentNode, 
  AgentEdge, 
  NodeResult, 
  GraphExecutionStatus, 
  GraphExecutionMetrics, 
  GraphExecutionState, 
  GraphLifecycleEvent, 
  GraphLifecycleEventType, 
  GraphLifecycleListener 
} from './types';

export class AgentGraphRuntime {
  private listeners: Set<GraphLifecycleListener> = new Set();

  constructor(private services: AgentServices) {}

  public addListener(listener: GraphLifecycleListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: GraphLifecycleListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(
    type: GraphLifecycleEventType,
    context: AgentContext,
    metrics: GraphExecutionMetrics,
    nodeId?: string,
    targetNodeId?: string,
    details?: Record<string, any>
  ): void {
    const event: GraphLifecycleEvent = {
      type,
      requestId: context.requestId,
      traceId: context.traceId,
      timestamp: new Date().toISOString(),
      nodeId,
      targetNodeId,
      metrics: { ...metrics },
      details
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[AgentGraphRuntime] Callback listener failed:", err);
      }
    }
  }

  public async run(
    graph: AgentGraph,
    context: AgentContext,
    options?: { maxIterations?: number }
  ): Promise<GraphExecutionState> {
    const startTime = Date.now();
    const maxIterations = options?.maxIterations || 10;

    const metrics: GraphExecutionMetrics = {
      nodesExecuted: 0,
      transitionsTaken: 0,
      duration: 0,
      maxDepth: 0,
      loopCount: 0
    };

    this.emitEvent('GRAPH_STARTED', context, metrics, graph.startNodeId);

    let currentNodeId = graph.startNodeId;
    let status: GraphExecutionStatus = 'RUNNING';

    const visitCounts: Record<string, number> = {};

    while (currentNodeId) {
      const node = graph.nodes[currentNodeId];
      if (!node) {
        status = 'COMPLETED';
        break;
      }

      // Check visit iteration limits
      const visits = (visitCounts[currentNodeId] || 0) + 1;
      visitCounts[currentNodeId] = visits;
      metrics.nodesExecuted++;

      if (visits > 1) {
        metrics.loopCount++;
        this.emitEvent('GRAPH_LOOP_DETECTED', context, metrics, currentNodeId);
      }

      if (visits > maxIterations) {
        status = 'CANCELLED';
        this.emitEvent('GRAPH_ITERATIONS_EXCEEDED', context, metrics, currentNodeId, undefined, {
          error: `Node "${currentNodeId}" exceeded max loop iterations limit of ${maxIterations}.`
        });
        break;
      }

      // Execute node action
      this.emitEvent('NODE_STARTED', context, metrics, currentNodeId);
      let nodeResult: NodeResult;

      try {
        const output = await this.executeAction(node.action, context);
        nodeResult = {
          status: 'SUCCESS',
          output
        };
        this.emitEvent('NODE_COMPLETED', context, metrics, currentNodeId, undefined, { output });
      } catch (err: any) {
        nodeResult = {
          status: 'FAILED',
          metadata: { error: err.message }
        };
        this.emitEvent('NODE_FAILED', context, metrics, currentNodeId, undefined, { error: err.message });
      }

      // Evaluate edge transitions
      const outgoingEdges = graph.edges.filter(e => e.sourceNodeId === currentNodeId);
      let nextNodeId: string | null = null;

      for (const edge of outgoingEdges) {
        let conditionMet = true;
        if (edge.condition) {
          try {
            conditionMet = await edge.condition(nodeResult);
          } catch {
            conditionMet = false;
          }
        }

        if (conditionMet) {
          nextNodeId = edge.targetNodeId;
          metrics.transitionsTaken++;
          this.emitEvent('TRANSITION_TAKEN', context, metrics, currentNodeId, nextNodeId, {
            edgeLabel: edge.label
          });
          break;
        }
      }

      if (!nextNodeId) {
        status = 'COMPLETED';
        break;
      }

      currentNodeId = nextNodeId;
    }

    metrics.duration = Date.now() - startTime;
    this.emitEvent('GRAPH_COMPLETED', context, metrics);

    return {
      currentNodeId,
      status,
      metrics
    };
  }

  private async executeAction(action: AgentAction, context: AgentContext): Promise<any> {
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
        return `Action ${action.actionType} executed (extensible fallback).`;
    }
  }
}
