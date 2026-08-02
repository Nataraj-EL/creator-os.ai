import test from 'node:test';
import assert from 'node:assert';
import { 
  AgentRegistry,
  MessageBus,
  TaskScheduler,
  MultiAgentRuntime,
  AgentProfile,
  AgentTask,
  featureFlags 
} from '../index';
import { AgentPlanner, AgentRuntime, AgentServices } from '../../agent';
import { ProviderRegistry, MockProvider, DefaultProviderResolver } from '../../providers';
import { RetrievalService } from '../../retrieval';
import { ToolRegistry, DefaultToolExecutor, DefaultToolValidator, ToolRuntime, Tool } from '../../tools';
import { StreamRuntime, DefaultStreamAdapter, WordChunkingStrategy } from '../../streaming';
import { DefaultEvaluationService } from '../../evaluation/services';
import { DefaultMemoryLearningService } from '../../memory/extraction/services/learningService';

test('Multi-Agent Runtime Test Suite', async (t) => {

  // Setup mock services
  const providerRegistry = new ProviderRegistry();
  const mockProvider = new MockProvider();
  mockProvider.name = 'mock';
  mockProvider.setMockResponse('Agent generated answer.');
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

  const planner = new AgentPlanner();

  // Create isolated AgentRuntimes
  const agent1 = new AgentRuntime(planner, services);
  const agent2 = new AgentRuntime(planner, services);

  const profile1: AgentProfile = { id: 'agent-1', name: 'Writer', role: 'writing', capabilities: ['text'], version: '1.0.0' };
  const profile2: AgentProfile = { id: 'agent-2', name: 'Editor', role: 'editing', capabilities: ['formatting'], version: '1.0.0' };

  await t.test('1. AgentRegistry discovery & lifecycle states', () => {
    const registry = new AgentRegistry();
    registry.register(profile1, services, agent1);
    registry.register(profile2, services, agent2);

    const resolved = registry.resolve('agent-1');
    assert.strictEqual(resolved.profile.name, 'Writer');
    assert.strictEqual(resolved.enabled, true);

    registry.disableAgent('agent-1');
    assert.strictEqual(registry.resolve('agent-1').enabled, false);

    const active = registry.getActiveAgents();
    assert.strictEqual(active.length, 1);
    assert.strictEqual(active[0].profile.id, 'agent-2');
  });

  await t.test('2. MessageBus routing and message immutability', () => {
    const messageBus = new MessageBus();
    const received: any[] = [];

    messageBus.subscribe('agent-2', (msg) => {
      received.push(msg);
    });

    const msgPayload = {
      messageId: 'msg-1',
      senderId: 'agent-1',
      recipientId: 'agent-2',
      content: { text: 'hello' },
      timestamp: new Date().toISOString(),
      traceId: 'trace-m1'
    };

    messageBus.publish(msgPayload);

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].content.text, 'hello');

    // Immutability: checking that content object properties are frozen
    assert.throws(() => {
      received[0].content.text = 'modified';
    });
  });

  await t.test('3. TaskScheduler topological DAG routing & cycle validation', () => {
    const scheduler = new TaskScheduler();

    const tasks: AgentTask[] = [
      { id: 'task-1', agentId: 'agent-1', description: 'Task 1', status: 'PENDING' },
      { id: 'task-2', agentId: 'agent-2', description: 'Task 2', dependencies: ['task-1'], status: 'PENDING' },
      { id: 'task-3', agentId: 'agent-1', description: 'Task 3', dependencies: ['task-1'], status: 'PENDING' }
    ];

    const batches = scheduler.schedule(tasks);
    assert.strictEqual(batches.length, 2);
    assert.strictEqual(batches[0].length, 1); // task-1 in layer 0
    assert.strictEqual(batches[1].length, 2); // task-2, task-3 in layer 1

    // Cyclic check
    const cyclicTasks: AgentTask[] = [
      { id: 't-1', agentId: 'agent-1', description: 'T1', dependencies: ['t-2'], status: 'PENDING' },
      { id: 't-2', agentId: 'agent-2', description: 'T2', dependencies: ['t-1'], status: 'PENDING' }
    ];
    assert.throws(() => {
      scheduler.schedule(cyclicTasks);
    });
  });

  await t.test('4. MultiAgentRuntime execution of sequential workflows', async () => {
    const registry = new AgentRegistry();
    registry.register(profile1, services, agent1);
    registry.register(profile2, services, agent2);

    const messageBus = new MessageBus();
    const coordinator = new MultiAgentRuntime(registry, messageBus);

    const tasks: AgentTask[] = [
      { id: 'task-1', agentId: 'agent-1', description: 'Write a draft', status: 'PENDING' },
      { id: 'task-2', agentId: 'agent-2', description: 'Edit the draft', dependencies: ['task-1'], status: 'PENDING' }
    ];

    const res = await coordinator.execute(tasks);
    assert.strictEqual(res.status, 'COMPLETED');
    assert.strictEqual(res.participatingAgents.length, 2);
    assert.ok(res.outputs['task-1']);
    assert.ok(res.outputs['task-2']);
  });

  await t.test('5. Multi-Agent execution policies (timeout and fail-fast)', async () => {
    const registry = new AgentRegistry();
    registry.register(profile1, services, agent1);

    const messageBus = new MessageBus();
    const coordinator = new MultiAgentRuntime(registry, messageBus);

    // Timeout policy test
    mockProvider.setLatency(50);
    const tasks: AgentTask[] = [
      { id: 't-1', agentId: 'agent-1', description: 'Slow execution task', status: 'PENDING' }
    ];
    const resTimeout = await coordinator.execute(tasks, { timeout: 5 }); // 5ms timeout gate
    mockProvider.setLatency(0); // Reset latency
    assert.strictEqual(resTimeout.status, 'FAILED');
    assert.ok(resTimeout.errors['t-1'].includes('Timeout'));

    // Fail-fast test
    const failFastTasks: AgentTask[] = [
      { id: 'tf-1', agentId: 'agent-1', description: 'Failing task', status: 'PENDING' },
      { id: 'tf-2', agentId: 'agent-1', description: 'Should not run task', dependencies: ['tf-1'], status: 'PENDING' }
    ];

    // Setup resolver to return failure
    registry.clear();
    const failingAgent = {
      run: async () => {
        return {
          success: false,
          error: 'LLM Error'
        };
      }
    } as any;
    registry.register(profile1, services, failingAgent);

    const resFailFast = await coordinator.execute(failFastTasks, { failFast: true });
    assert.strictEqual(resFailFast.status, 'FAILED');
    assert.strictEqual(failFastTasks[1].status, 'PENDING'); // Layer 1 task skipped due to failFast abort!
  });

  await t.test('6. Backward compatibility and default configurations', () => {
    assert.strictEqual(featureFlags.MULTI_AGENT, false);
    assert.strictEqual(featureFlags.PARALLEL_AGENTS, false);
  });

});
