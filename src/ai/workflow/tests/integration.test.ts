import test from 'node:test';
import assert from 'node:assert';
import { featureFlags } from '../config/featureFlags';
import { WorkflowPersistenceFactory } from '../storage/persistenceFactory';
import { traceEventBus } from '../../observability';
import { WorkflowRegistry, StepExecutorRegistry, WorkflowRuntime, WorkflowDefinition } from '../index';

test('Workflow Observability Integration Test Suite', async (t) => {

  const originalEnv = { ...process.env };

  await t.test('1. Factory resolves to InMemory when flags are disabled', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/fake';
    featureFlags.POSTGRES_WORKFLOW_PERSISTENCE = false;
    featureFlags.DURABLE_WORKFLOWS = false;
    
    WorkflowPersistenceFactory.clear();
    const store = WorkflowPersistenceFactory.getStore();
    assert.strictEqual(store.constructor.name, 'InMemoryWorkflowPersistenceStore');
  });

  await t.test('2. WorkflowRuntime events correctly publish to traceEventBus', async () => {
    const registry = new WorkflowRegistry();
    const executorRegistry = new StepExecutorRegistry();
    WorkflowPersistenceFactory.clear();
    const persistence = WorkflowPersistenceFactory.getStore();

    const runtime = new WorkflowRuntime(registry, persistence, executorRegistry, {});

    const definition: WorkflowDefinition = {
      id: 'test-obs-flow',
      name: 'Integration Test Flow',
      version: '1.0.0',
      trigger: { type: 'MANUAL', config: {} },
      steps: {
        'step-1': {
          id: 'step-1',
          name: 'Start Step',
          type: 'START',
          payload: {},
          nextStepId: undefined
        }
      },
      startStepId: 'step-1'
    };

    registry.register(definition);

    const publishedEvents: any[] = [];
    const unsubscribe = traceEventBus.subscribe((evt) => {
      if (evt.stage === 'workflow') {
        publishedEvents.push(evt);
      }
    });

    await runtime.executeWorkflow('test-obs-flow');

    unsubscribe();

    // Verify events were bridged to traceEventBus
    assert.ok(publishedEvents.length >= 2, "Expected at least started and completed trace events");
    assert.strictEqual(publishedEvents[0].status, 'started');
    assert.strictEqual(publishedEvents[publishedEvents.length - 1].status, 'completed');
  });

  Object.assign(process.env, originalEnv);
});
