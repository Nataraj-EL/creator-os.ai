import { AgentRequest, AgentPlan, AgentStep } from './types';

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
}
