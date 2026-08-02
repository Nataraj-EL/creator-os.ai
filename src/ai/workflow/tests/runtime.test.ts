import test from 'node:test';
import assert from 'node:assert';
import { 
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowRegistry,
  InMemoryWorkflowPersistenceStore,
  StepExecutorRegistry,
  WorkflowRuntime,
  featureFlags 
} from '../index';
import { AgentPlanner, AgentRuntime, AgentServices } from '../../agent';
import { ProviderRegistry, MockProvider, DefaultProviderResolver } from '../../providers';
import { RetrievalService } from '../../retrieval';
import { ToolRegistry, DefaultToolExecutor, DefaultToolValidator, ToolRuntime, Tool } from '../../tools';
import { StreamRuntime, DefaultStreamAdapter, WordChunkingStrategy } from '../../streaming';
import { DefaultEvaluationService } from '../../evaluation/services';
import { DefaultMemoryLearningService } from '../../memory/extraction/services/learningService';

test('Workflow Runtime Test Suite', async (t) => {

  // Setup services dependencies DI context
  const providerRegistry = new ProviderRegistry();
  const mockProvider = new MockProvider();
  mockProvider.name = 'mock';
  mockProvider.setMockResponse('Draft content payload from agent.');
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
  const agentRuntime = new AgentRuntime(planner, services);

  const servicesMap = {
    agentRuntime,
    toolRuntime
  };

  const startStep = { id: 'start-1', name: 'Start', type: 'START' as const, payload: { inputs: { topic: 'AI' } }, nextStepId: 'agent-1' };
  const agentStep = { id: 'agent-1', name: 'Write draft', type: 'AGENT' as const, payload: { prompt: 'Write about {{topic}}', outputVariable: 'draft' }, nextStepId: 'end-1' };
  const endStep = { id: 'end-1', name: 'End', type: 'END' as const, payload: {} };

  const def1: WorkflowDefinition = {
    id: 'wf-seq',
    name: 'Sequential flow',
    version: '1.0.0',
    trigger: { type: 'MANUAL', config: {} },
    steps: {
      'start-1': startStep,
      'agent-1': agentStep,
      'end-1': endStep
    },
    startStepId: 'start-1'
  };

  await t.test('1. WorkflowRegistry registration & versioning resolution', () => {
    const registry = new WorkflowRegistry();
    registry.register(def1);

    const resolved = registry.resolve('wf-seq');
    assert.strictEqual(resolved.name, 'Sequential flow');
    assert.strictEqual(resolved.version, '1.0.0');

    // Register a newer version
    const def2: WorkflowDefinition = {
      ...def1,
      version: '2.0.0',
      name: 'Sequential flow v2'
    };
    registry.register(def2);

    // Resolve without version parameter should yield latest version
    const resolvedLatest = registry.resolve('wf-seq');
    assert.strictEqual(resolvedLatest.version, '2.0.0');
    assert.strictEqual(resolvedLatest.name, 'Sequential flow v2');

    // Explicit version query
    const resolvedV1 = registry.resolve('wf-seq', '1.0.0');
    assert.strictEqual(resolvedV1.version, '1.0.0');
  });

  await t.test('2. Sequential execution across agent step', async () => {
    const registry = new WorkflowRegistry();
    registry.register(def1);

    const persistence = new InMemoryWorkflowPersistenceStore();
    const executorRegistry = new StepExecutorRegistry();
    const runtime = new WorkflowRuntime(registry, persistence, executorRegistry, servicesMap);

    const result = await runtime.executeWorkflow('wf-seq');
    assert.strictEqual(result.status, 'COMPLETED');
    assert.strictEqual(result.variables.topic, 'AI');
    assert.strictEqual(result.variables.draft, 'Draft content payload from agent.');
  });

  await t.test('3. Conditional routing branching path', async () => {
    // START -> CONDITION -> (Met? -> AGENT -> END) / (Not Met? -> END)
    const condStep = {
      id: 'cond-1',
      name: 'Verify condition',
      type: 'CONDITION' as const,
      payload: { variable: 'topic', value: 'AI', trueStepId: 'agent-1', falseStepId: 'end-1' }
    };

    const defCond: WorkflowDefinition = {
      id: 'wf-cond',
      name: 'Conditional flow',
      version: '1.0.0',
      trigger: { type: 'MANUAL', config: {} },
      steps: {
        'start-1': { ...startStep, nextStepId: 'cond-1' },
        'cond-1': condStep,
        'agent-1': agentStep,
        'end-1': endStep
      },
      startStepId: 'start-1'
    };

    const registry = new WorkflowRegistry();
    registry.register(defCond);

    const persistence = new InMemoryWorkflowPersistenceStore();
    const executorRegistry = new StepExecutorRegistry();
    const runtime = new WorkflowRuntime(registry, persistence, executorRegistry, servicesMap);

    // Run matching case
    const resMet = await runtime.executeWorkflow('wf-cond', { topic: 'AI' });
    assert.strictEqual(resMet.status, 'COMPLETED');
    assert.strictEqual(resMet.variables.draft, 'Draft content payload from agent.');

    // Run non-matching case (skip agent draft step)
    const resNotMet = await runtime.executeWorkflow('wf-cond', { topic: 'Art' });
    assert.strictEqual(resNotMet.status, 'COMPLETED');
    assert.strictEqual(resNotMet.variables.draft, undefined);
  });

  await t.test('4. Checkpoint pausing and resumption of HUMAN node', async () => {
    featureFlags.WORKFLOW_PERSISTENCE = true;

    // START -> HUMAN -> END
    const humanStep = {
      id: 'human-1',
      name: 'Await editor approval',
      type: 'HUMAN' as const,
      payload: { outputVariable: 'approvedText' },
      nextStepId: 'end-1'
    };

    const defHuman: WorkflowDefinition = {
      id: 'wf-human',
      name: 'Human-in-the-Loop workflow',
      version: '1.0.0',
      trigger: { type: 'MANUAL', config: {} },
      steps: {
        'start-1': { ...startStep, nextStepId: 'human-1' },
        'human-1': humanStep,
        'end-1': endStep
      },
      startStepId: 'start-1'
    };

    const registry = new WorkflowRegistry();
    registry.register(defHuman);

    const persistence = new InMemoryWorkflowPersistenceStore();
    const executorRegistry = new StepExecutorRegistry();
    const runtime = new WorkflowRuntime(registry, persistence, executorRegistry, servicesMap);

    // Run first time: should suspend and return PAUSED status
    const pausedExec = await runtime.executeWorkflow('wf-human');
    assert.strictEqual(pausedExec.status, 'PAUSED');
    assert.strictEqual(pausedExec.currentStepId, 'human-1');

    // Resume from paused persistence state
    const resumedExec = await runtime.resumeWorkflow(pausedExec.executionId, 'Human Approved Content!');
    assert.strictEqual(resumedExec.status, 'COMPLETED');
    assert.strictEqual(resumedExec.variables.approvedText, 'Human Approved Content!');

    featureFlags.WORKFLOW_PERSISTENCE = false;
  });

  await t.test('5. Execution policies timeout & retry actions', async () => {
    const registry = new WorkflowRegistry();
    registry.register(def1);

    const persistence = new InMemoryWorkflowPersistenceStore();
    const executorRegistry = new StepExecutorRegistry();
    const runtime = new WorkflowRuntime(registry, persistence, executorRegistry, servicesMap);

    // Test steps timeout
    mockProvider.setLatency(50);
    const timeoutRes = await runtime.executeWorkflow('wf-seq', {}, { timeout: 5 }); // 5ms timeout threshold
    mockProvider.setLatency(0); // reset
    assert.strictEqual(timeoutRes.status, 'FAILED');

    // Test retries policy
    let callCount = 0;
    const failingExecutor = {
      execute: async () => {
        callCount++;
        throw new Error('Transient network error.');
      }
    };
    // Override AGENT step executor in registry
    executorRegistry.register('AGENT', failingExecutor);

    const retryRes = await runtime.executeWorkflow('wf-seq', {}, { maxRetries: 2, failFast: false });
    assert.strictEqual(retryRes.status, 'FAILED');
    assert.strictEqual(callCount, 3); // 1 initial attempt + 2 retries = 3 calls total
  });

  await t.test('6. Feature flags backward compatibility', () => {
    assert.strictEqual(featureFlags.WORKFLOW_RUNTIME, false);
    assert.strictEqual(featureFlags.WORKFLOW_PARALLEL, false);
    assert.strictEqual(featureFlags.WORKFLOW_PERSISTENCE, false);
  });

});
