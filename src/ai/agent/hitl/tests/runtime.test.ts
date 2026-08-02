import test from 'node:test';
import assert from 'node:assert';
import { 
  HITLRuntime,
  featureFlags 
} from '../index';
import { 
  AgentGraphRuntime, 
  AgentGraph, 
  AgentNode, 
  AgentEdge 
} from '../../graph/index';
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

test('Human-in-the-Loop Runtime Test Suite', async (t) => {

  // Setup services DI context
  const providerRegistry = new ProviderRegistry();
  const mockProvider = new MockProvider();
  mockProvider.name = 'mock';
  mockProvider.setMockResponse('Sample generate result');
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
    requestId: 'req-h1',
    traceId: 'trace-h1',
    creatorId: 'creator-h1',
    workspaceId: 'workspace-h1',
    prompt: 'Query topic'
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

  await t.test('1. Checkpoint creation & token verification', () => {
    const hitlRuntime = new HITLRuntime();
    const graphState = {
      currentNodeId: 'node-start',
      status: 'RUNNING' as any,
      metrics: { nodesExecuted: 1, transitionsTaken: 0, duration: 0, maxDepth: 0, loopCount: 0 }
    };

    const checkpoint = hitlRuntime.createCheckpoint(graphState, context, { policyType: 'SINGLE_APPROVER' });
    
    assert.strictEqual(checkpoint.status, 'WAITING');
    assert.ok(checkpoint.checkpointId.startsWith('chk-'));
    assert.ok(checkpoint.resumeToken.startsWith('tok-'));
    assert.strictEqual(checkpoint.policy?.policyType, 'SINGLE_APPROVER');

    const retrieved = hitlRuntime.getCheckpoint(checkpoint.checkpointId);
    assert.strictEqual(retrieved?.checkpointId, checkpoint.checkpointId);
  });

  await t.test('2. Graph pause on approval node and resume approval flow', async () => {
    // Enable HITL feature flags
    featureFlags.HITL_RUNTIME = true;
    featureFlags.HITL_CHECKPOINTS = true;

    try {
      const hitlRuntime = new HITLRuntime();
      const graphRuntime = new AgentGraphRuntime(services);

      const testGraph: AgentGraph = {
        startNodeId: 'node-approve',
        nodes: {
          'node-approve': {
            id: 'node-approve',
            action: { actionType: 'GENERATE', payload: {} },
            requiresHumanApproval: true,
            approvalPolicy: { policyType: 'SINGLE_APPROVER' }
          },
          'node-end': {
            id: 'node-end',
            action: { actionType: 'COMPLETE', payload: {} }
          }
        },
        edges: [
          {
            sourceNodeId: 'node-approve',
            targetNodeId: 'node-end',
            label: 'success'
          }
        ]
      };

      // Run first time: must pause and return PAUSED status
      const pausedState = await graphRuntime.run(testGraph, context, { hitlRuntime });
      assert.strictEqual(pausedState.status, 'PAUSED');
      
      // Resolve generated checkpoint details from memory
      const checkpointId = pausedState.currentNodeId; // current node ID
      
      // Find checkpoint in hitl runtime cache
      const activeCheckpoints = (hitlRuntime as any).checkpoints;
      let foundCheckpointId = '';
      let foundResumeToken = '';
      for (const [key, val] of activeCheckpoints.entries()) {
        if (val.graphState.currentNodeId === checkpointId && val.status === 'WAITING') {
          foundCheckpointId = key;
          foundResumeToken = val.resumeToken;
          break;
        }
      }
      assert.ok(foundCheckpointId);

      // Resume from checkpoint using APPROVE decision
      const resumedState = await graphRuntime.run(testGraph, context, {
        hitlRuntime,
        resumeCheckpointId: foundCheckpointId,
        resumeToken: foundResumeToken,
        decision: { decisionType: 'APPROVE' }
      });

      assert.strictEqual(resumedState.status, 'COMPLETED');
      assert.strictEqual(resumedState.currentNodeId, 'node-end');
    } finally {
      // Restore feature flags
      featureFlags.HITL_RUNTIME = false;
      featureFlags.HITL_CHECKPOINTS = false;
    }
  });

  await t.test('3. Rejection decision flow', async () => {
    featureFlags.HITL_RUNTIME = true;
    featureFlags.HITL_CHECKPOINTS = true;

    try {
      const hitlRuntime = new HITLRuntime();
      const graphRuntime = new AgentGraphRuntime(services);

      const testGraph: AgentGraph = {
        startNodeId: 'node-approve',
        nodes: {
          'node-approve': {
            id: 'node-approve',
            action: { actionType: 'GENERATE', payload: {} },
            requiresHumanApproval: true
          },
          'node-fallback': {
            id: 'node-fallback',
            action: { actionType: 'COMPLETE', payload: {} }
          }
        },
        edges: [
          {
            sourceNodeId: 'node-approve',
            targetNodeId: 'node-fallback',
            label: 'fallback',
            condition: (result) => result.status === 'FAILED'
          }
        ]
      };

      const pausedState = await graphRuntime.run(testGraph, context, { hitlRuntime });
      assert.strictEqual(pausedState.status, 'PAUSED');

      const activeCheckpoints = (hitlRuntime as any).checkpoints;
      let chkId = '';
      let tokStr = '';
      for (const [k, v] of activeCheckpoints.entries()) {
        if (v.status === 'WAITING') {
          chkId = k;
          tokStr = v.resumeToken;
        }
      }

      // Resume with REJECT: should transition to fallback node
      const resumedState = await graphRuntime.run(testGraph, context, {
        hitlRuntime,
        resumeCheckpointId: chkId,
        resumeToken: tokStr,
        decision: { decisionType: 'REJECT', reason: 'Not acceptable content.' }
      });

      assert.strictEqual(resumedState.status, 'COMPLETED');
      assert.strictEqual(resumedState.currentNodeId, 'node-fallback');
    } finally {
      featureFlags.HITL_RUNTIME = false;
      featureFlags.HITL_CHECKPOINTS = false;
    }
  });

  await t.test('4. Edit decision output override flow', async () => {
    featureFlags.HITL_RUNTIME = true;
    featureFlags.HITL_CHECKPOINTS = true;

    try {
      const hitlRuntime = new HITLRuntime();
      const graphRuntime = new AgentGraphRuntime(services);

      const testGraph: AgentGraph = {
        startNodeId: 'node-approve',
        nodes: {
          'node-approve': {
            id: 'node-approve',
            action: { actionType: 'GENERATE', payload: {} },
            requiresHumanApproval: true
          },
          'node-end': {
            id: 'node-end',
            action: { actionType: 'COMPLETE', payload: {} }
          }
        },
        edges: [
          {
            sourceNodeId: 'node-approve',
            targetNodeId: 'node-end',
            label: 'success'
          }
        ]
      };

      const pausedState = await graphRuntime.run(testGraph, context, { hitlRuntime });
      
      const activeCheckpoints = (hitlRuntime as any).checkpoints;
      let chkId = '';
      let tokStr = '';
      for (const [k, v] of activeCheckpoints.entries()) {
        if (v.status === 'WAITING') {
          chkId = k;
          tokStr = v.resumeToken;
        }
      }

      // Resume with EDIT decision: should override output variable
      await graphRuntime.run(testGraph, context, {
        hitlRuntime,
        resumeCheckpointId: chkId,
        resumeToken: tokStr,
        decision: { decisionType: 'EDIT', editedOutput: 'Injecting custom human override text.' }
      });

      // Check edited value has been written to context variables
      assert.strictEqual(context.variables.generatedText, 'Injecting custom human override text.');
    } finally {
      featureFlags.HITL_RUNTIME = false;
      featureFlags.HITL_CHECKPOINTS = false;
    }
  });

  await t.test('5. Backward compatibility (flag false, execute straight through)', async () => {
    // Flag disabled by default
    assert.strictEqual(featureFlags.HITL_RUNTIME, false);

    const hitlRuntime = new HITLRuntime();
    const graphRuntime = new AgentGraphRuntime(services);

    const testGraph: AgentGraph = {
      startNodeId: 'node-approve',
      nodes: {
        'node-approve': {
          id: 'node-approve',
          action: { actionType: 'GENERATE', payload: {} },
          requiresHumanApproval: true
        },
        'node-end': {
          id: 'node-end',
          action: { actionType: 'COMPLETE', payload: {} }
        }
      },
      edges: [
        {
          sourceNodeId: 'node-approve',
          targetNodeId: 'node-end',
          label: 'success'
        }
      ]
    };

    const state = await graphRuntime.run(testGraph, context, { hitlRuntime });
    // Should run straight through (COMPLETED) rather than pausing
    assert.strictEqual(state.status, 'COMPLETED');
  });

});
