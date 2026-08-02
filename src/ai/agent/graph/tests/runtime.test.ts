import test from 'node:test';
import assert from 'node:assert';
import { 
  AgentGraphRuntime,
  AgentGraph,
  AgentNode,
  AgentEdge,
  featureFlags 
} from '../index';
import { 
  AgentPlanner, 
  AgentServices, 
  AgentContext,
  AgentRequest 
} from '../../index';
import { ProviderRegistry, MockProvider, DefaultProviderResolver } from '../../../providers';
import { RetrievalService } from '../../../retrieval';
import { ToolRegistry, DefaultToolExecutor, DefaultToolValidator, ToolRuntime, Tool } from '../../../tools';
import { StreamRuntime, DefaultStreamAdapter, WordChunkingStrategy } from '../../../streaming';
import { DefaultEvaluationService } from '../../../evaluation/services';
import { DefaultMemoryLearningService } from '../../../memory/extraction/services/learningService';

test('Agent Graph Runtime Test Suite', async (t) => {

  // Setup services DI context
  const providerRegistry = new ProviderRegistry();
  const mockProvider = new MockProvider();
  mockProvider.name = 'mock';
  mockProvider.setMockResponse('Mock output text');
  providerRegistry.register(mockProvider);

  const providerResolver = new DefaultProviderResolver(providerRegistry);
  const retrievalService = new RetrievalService();
  
  const toolRegistry = new ToolRegistry();
  const dummyTool: Tool = {
    name: 'fetch_weather',
    description: 'weather',
    category: 'info',
    schema: { name: 'fetch_weather', description: 'weather', parameters: { type: 'object', properties: {} } },
    execute: async () => ({ temp: 22 })
  };
  toolRegistry.register(dummyTool);

  const toolExecutor = new DefaultToolExecutor();
  const toolValidator = new DefaultToolValidator();
  const toolRuntime = new ToolRuntime(toolRegistry, toolExecutor, toolValidator);

  const streamRuntime = new StreamRuntime(providerResolver, new DefaultStreamAdapter(), new WordChunkingStrategy());
  const evaluationService = new DefaultEvaluationService();
  
  const mockExtractor = { extract: async () => [] };
  const memoryLearningService = new DefaultMemoryLearningService(mockExtractor as any);

  const services: AgentServices = {
    providerResolver,
    retrievalService,
    toolRuntime,
    streamRuntime,
    evaluationService,
    memoryLearningService
  };

  const req: AgentRequest = {
    requestId: 'req-g1',
    traceId: 'trace-g1',
    creatorId: 'creator-g1',
    workspaceId: 'workspace-g1',
    prompt: 'Query prompt'
  };

  const context: AgentContext = {
    request: req,
    variables: {},
    retrievedMemories: [],
    toolOutputs: [],
    evaluationResults: [],
    traceId: req.traceId,
    requestId: req.requestId
  };

  await t.test('1. Graph execution routing & metrics tracking', async () => {
    const planner = new AgentPlanner();
    const graph = planner.planGraph(req);

    const runtime = new AgentGraphRuntime(services);
    const state = await runtime.run(graph, context);

    assert.strictEqual(state.status, 'COMPLETED');
    assert.ok(state.metrics.nodesExecuted > 3);
    assert.strictEqual(state.metrics.transitionsTaken, state.metrics.nodesExecuted - 1);
    assert.ok(state.metrics.duration >= 0);
  });

  await t.test('2. Conditional branching path selection via NodeResult', async () => {
    const runtime = new AgentGraphRuntime(services);

    // Build custom branching graph
    const customGraph: AgentGraph = {
      startNodeId: 'node-start',
      nodes: {
        'node-start': {
          id: 'node-start',
          action: { actionType: 'GENERATE', payload: { prompt: 'generate' } }
        },
        'node-left': {
          id: 'node-left',
          action: { actionType: 'COMPLETE', payload: { text: 'Left branch taken.' } }
        },
        'node-right': {
          id: 'node-right',
          action: { actionType: 'COMPLETE', payload: { text: 'Right branch taken.' } }
        }
      },
      edges: [
        {
          sourceNodeId: 'node-start',
          targetNodeId: 'node-left',
          label: 'success',
          condition: (result) => result.status === 'SUCCESS'
        },
        {
          sourceNodeId: 'node-start',
          targetNodeId: 'node-right',
          label: 'failure',
          condition: (result) => result.status === 'FAILED'
        }
      ]
    };

    const state = await runtime.run(customGraph, context);
    
    assert.strictEqual(state.status, 'COMPLETED');
    assert.strictEqual(state.currentNodeId, 'node-left'); // Success node resolved!
    assert.strictEqual(state.metrics.transitionsTaken, 1);
  });

  await t.test('3. Infinite Loop Cycle MaxIterations abort protection', async () => {
    const runtime = new AgentGraphRuntime(services);

    // Build cycle graph returning back to start
    const cycleGraph: AgentGraph = {
      startNodeId: 'node-start',
      nodes: {
        'node-start': {
          id: 'node-start',
          action: { actionType: 'COMPLETE', payload: {} }
        }
      },
      edges: [
        {
          sourceNodeId: 'node-start',
          targetNodeId: 'node-start',
          label: 'retry'
        }
      ]
    };

    const maxLimit = 3;
    const state = await runtime.run(cycleGraph, context, { maxIterations: maxLimit });

    assert.strictEqual(state.status, 'CANCELLED');
    assert.strictEqual(state.metrics.nodesExecuted, maxLimit + 1); // Capped visit limit trigger
    assert.strictEqual(state.metrics.loopCount, maxLimit);
  });

  await t.test('4. Fail-open execution checks', async () => {
    const failingServices = {
      ...services,
      providerResolver: {
        resolve: () => ({
          generate: async () => {
            throw new Error('LLM Timeout');
          }
        })
      } as any
    };

    const runtime = new AgentGraphRuntime(failingServices);

    const errorGraph: AgentGraph = {
      startNodeId: 'node-start',
      nodes: {
        'node-start': {
          id: 'node-start',
          action: { actionType: 'GENERATE', payload: {} }
        },
        'node-fallback': {
          id: 'node-fallback',
          action: { actionType: 'COMPLETE', payload: {} }
        }
      },
      edges: [
        {
          sourceNodeId: 'node-start',
          targetNodeId: 'node-fallback',
          label: 'fallback',
          condition: (result) => result.status === 'FAILED'
        }
      ]
    };

    const state = await runtime.run(errorGraph, context);
    assert.strictEqual(state.status, 'COMPLETED');
    assert.strictEqual(state.currentNodeId, 'node-fallback'); // Fail-open fallback route resolved!
  });

  await t.test('5. Backward compatibility and default configurations', () => {
    assert.strictEqual(featureFlags.AGENT_GRAPH, false);
    assert.strictEqual(featureFlags.AGENT_CONDITIONALS, false);
  });

});
