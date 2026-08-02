import { AgentRequest, AgentPlan, AgentStep } from './types';
import { AgentGraph, AgentNode, AgentEdge } from './graph/types';

export class AgentPlanner {
  public plan(request: AgentRequest): AgentPlan {
    const steps: AgentStep[] = [];

    // Step 1: RETRIEVE_MEMORY
    steps.push({
      id: 'step-retrieve-memory',
      action: {
        actionType: 'RETRIEVE_MEMORY',
        payload: { text: request.prompt }
      },
      status: 'PENDING'
    });

    // Step 2: GENERATE
    steps.push({
      id: 'step-generate-reasoning',
      action: {
        actionType: 'GENERATE',
        payload: { prompt: request.prompt }
      },
      status: 'PENDING'
    });

    // Step 3: CALL_TOOL
    steps.push({
      id: 'step-call-tool',
      action: {
        actionType: 'CALL_TOOL',
        payload: { toolName: 'fetch_weather', arguments: { location: 'New York' } }
      },
      status: 'PENDING'
    });

    // Step 4: STORE_MEMORY
    steps.push({
      id: 'step-store-memory',
      action: {
        actionType: 'STORE_MEMORY',
        payload: { text: request.prompt }
      },
      status: 'PENDING'
    });

    // Step 5: EVALUATE
    steps.push({
      id: 'step-evaluate',
      action: {
        actionType: 'EVALUATE',
        payload: {}
      },
      status: 'PENDING'
    });

    // Step 6: COMPLETE
    steps.push({
      id: 'step-complete',
      action: {
        actionType: 'COMPLETE',
        payload: {}
      },
      status: 'PENDING'
    });

    return { steps };
  }

  public planGraph(request: AgentRequest): AgentGraph {
    const nodes: Record<string, AgentNode> = {
      'node-retrieve-memory': {
        id: 'node-retrieve-memory',
        action: { actionType: 'RETRIEVE_MEMORY', payload: { text: request.prompt } }
      },
      'node-generate': {
        id: 'node-generate',
        action: { actionType: 'GENERATE', payload: { prompt: request.prompt } }
      },
      'node-call-tool': {
        id: 'node-call-tool',
        action: { actionType: 'CALL_TOOL', payload: { toolName: 'fetch_weather', arguments: { location: 'New York' } } }
      },
      'node-evaluate': {
        id: 'node-evaluate',
        action: { actionType: 'EVALUATE', payload: {} }
      },
      'node-store-memory': {
        id: 'node-store-memory',
        action: { actionType: 'STORE_MEMORY', payload: { text: request.prompt } }
      },
      'node-complete': {
        id: 'node-complete',
        action: { actionType: 'COMPLETE', payload: {} }
      }
    };

    const edges: AgentEdge[] = [
      {
        sourceNodeId: 'node-retrieve-memory',
        targetNodeId: 'node-generate',
        label: 'success'
      },
      {
        sourceNodeId: 'node-generate',
        targetNodeId: 'node-call-tool',
        label: 'success',
        condition: (result) => result.status === 'SUCCESS'
      },
      {
        sourceNodeId: 'node-generate',
        targetNodeId: 'node-complete',
        label: 'fallback',
        condition: (result) => result.status === 'FAILED'
      },
      {
        sourceNodeId: 'node-call-tool',
        targetNodeId: 'node-evaluate',
        label: 'success'
      },
      {
        sourceNodeId: 'node-evaluate',
        targetNodeId: 'node-store-memory',
        label: 'success',
        condition: (result) => result.status === 'SUCCESS'
      },
      {
        sourceNodeId: 'node-evaluate',
        targetNodeId: 'node-complete',
        label: 'failure',
        condition: (result) => result.status === 'FAILED'
      },
      {
        sourceNodeId: 'node-store-memory',
        targetNodeId: 'node-complete',
        label: 'success'
      }
    ];

    return {
      startNodeId: 'node-retrieve-memory',
      nodes,
      edges
    };
  }
}
