import test from 'node:test';
import assert from 'node:assert';
import { 
  traceEventBus, 
  traceRuntime, 
  TraceRuntime, 
  HybridTraceStore,
  TraceEvent
} from '../index';
import { TraceMiddleware } from '../../middleware/builtins';

test('AI Observability & Trace Runtime Test Suite', async (t) => {

  await t.test('1. Event Bus Publish & Subscribe', async () => {
    const events: TraceEvent[] = [];
    const unsubscribe = traceEventBus.subscribe((evt) => {
      events.push(evt);
    });

    traceEventBus.publish({
      traceId: 'trace-eb-1',
      requestId: 'req-eb-1',
      stage: 'middleware',
      component: 'TraceMiddleware',
      status: 'started',
      metadata: { test: true }
    });

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].traceId, 'trace-eb-1');
    assert.strictEqual(events[0].requestId, 'req-eb-1');
    assert.strictEqual(events[0].stage, 'middleware');
    assert.strictEqual(events[0].component, 'TraceMiddleware');
    assert.strictEqual(events[0].status, 'started');
    assert.ok(events[0].eventId.startsWith('evt-'));
    assert.ok(events[0].timestamp);

    unsubscribe();

    traceEventBus.publish({
      traceId: 'trace-eb-2',
      requestId: 'req-eb-2',
      stage: 'middleware',
      component: 'TraceMiddleware',
      status: 'started',
      metadata: { test: true }
    });

    // Length should still be 1 after unsubscribe
    assert.strictEqual(events.length, 1);
  });

  await t.test('2. Trace Aggregation & Storage Abstraction', async () => {
    const store = new HybridTraceStore();
    const runtime = new TraceRuntime(store);

    const traceId = 'trace-agg-1';
    const requestId = 'req-agg-1';

    // Publish start event
    traceEventBus.publish({
      traceId,
      requestId,
      stage: 'middleware',
      component: 'TraceMiddleware',
      status: 'started',
      metadata: { model: 'gemini-1.5' }
    });

    // Wait a brief moment for async event processing
    await new Promise(resolve => setTimeout(resolve, 50));

    const trace = await runtime.getTrace(traceId);
    assert.ok(trace);
    assert.strictEqual(trace.traceId, traceId);
    assert.strictEqual(trace.status, 'active');
    assert.strictEqual(trace.events.length, 1);
    assert.strictEqual(trace.events[0].status, 'started');

    runtime.dispose();
  });

  await t.test('3. Event Ordering & Latency Calculation', async () => {
    const store = new HybridTraceStore();
    const runtime = new TraceRuntime(store);

    const traceId = 'trace-ord-1';
    const requestId = 'req-ord-1';

    // Start event
    traceEventBus.publish({
      traceId,
      requestId,
      stage: 'context',
      component: 'ContextAssemblyRuntime',
      status: 'started',
      metadata: {}
    });

    // Delay to simulate latency
    await new Promise(resolve => setTimeout(resolve, 100));

    // Completed event
    traceEventBus.publish({
      traceId,
      requestId,
      stage: 'context',
      component: 'ContextAssemblyRuntime',
      status: 'completed',
      metadata: {}
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    const trace = await runtime.getTrace(traceId);
    assert.ok(trace);
    assert.strictEqual(trace.events.length, 2);
    
    // Check ordering (started first, completed second)
    assert.strictEqual(trace.events[0].status, 'started');
    assert.strictEqual(trace.events[1].status, 'completed');

    // Check latency calculation
    const completedEvent = trace.events[1];
    assert.ok(completedEvent.latencyMs && completedEvent.latencyMs >= 80, `Expected latency >= 80ms, got ${completedEvent.latencyMs}ms`);

    runtime.dispose();
  });

  await t.test('4. End-to-End Pipeline Complete Status', async () => {
    const store = new HybridTraceStore();
    const runtime = new TraceRuntime(store);

    const traceId = 'trace-e2e-1';
    const requestId = 'req-e2e-1';

    // Start middleware
    traceEventBus.publish({
      traceId,
      requestId,
      stage: 'middleware',
      component: 'TraceMiddleware',
      status: 'started',
      metadata: {}
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    // Complete middleware (completes the overall pipeline trace)
    traceEventBus.publish({
      traceId,
      requestId,
      stage: 'middleware',
      component: 'TraceMiddleware',
      status: 'completed',
      metadata: {}
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    const trace = await runtime.getTrace(traceId);
    assert.ok(trace);
    assert.strictEqual(trace.status, 'completed');
    assert.ok(trace.durationMs && trace.durationMs >= 40, `Expected duration >= 40ms, got ${trace.durationMs}ms`);
    assert.ok(trace.endTime);

    runtime.dispose();
  });

  await t.test('5. Backward Compatibility & Default Exports', () => {
    assert.ok(traceRuntime);
    const middleware = new TraceMiddleware();
    assert.ok(middleware.metadata);
    assert.strictEqual(middleware.priority, 100);
  });

});
