import test from 'node:test';
import assert from 'node:assert';
import { 
  ToolRegistry, 
  DefaultToolExecutor, 
  DefaultToolValidator, 
  ToolRuntime, 
  ToolResolver, 
  Tool, 
  featureFlags 
} from '../index';

test('AI Tool Calling Test Suite', async (t) => {

  const dummyTool: Tool = {
    name: 'fetch_weather',
    description: 'gets weather',
    category: 'info',
    schema: {
      name: 'fetch_weather',
      description: 'gets weather',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          days: { type: 'integer' }
        },
        required: ['city']
      }
    },
    execute: async (args) => {
      if (args.city === 'fail') {
        throw new Error('Upstream failed');
      }
      return { temp: 22, city: args.city };
    }
  };

  await t.test('1. ToolRegistry registration & category lookup', () => {
    const registry = new ToolRegistry();
    registry.register(dummyTool);
    
    assert.strictEqual(registry.listTools().length, 1);
    assert.strictEqual(registry.resolve('fetch_weather').name, 'fetch_weather');
    assert.strictEqual(registry.getToolsByCategory('info').length, 1);

    registry.unregister('fetch_weather');
    assert.throws(() => registry.resolve('fetch_weather'), /not registered/);
  });

  await t.test('2. ToolValidator schema parameter validations', () => {
    const validator = new DefaultToolValidator();
    
    // Valid args
    assert.doesNotThrow(() => validator.validate(dummyTool, { city: 'Paris', days: 3 }));

    // Missing required field
    assert.throws(() => validator.validate(dummyTool, { days: 3 }), /Missing required parameter/);

    // Type mismatch string -> number
    assert.throws(() => validator.validate(dummyTool, { city: 123 }), /Type mismatch/);

    // Type mismatch integer -> float
    assert.throws(() => validator.validate(dummyTool, { city: 'Paris', days: 3.5 }), /Type mismatch/);
  });

  await t.test('3. ToolRuntime execution retries', async () => {
    featureFlags.TOOL_VALIDATION = true;
    featureFlags.TOOL_RETRIES = true;

    const registry = new ToolRegistry();
    registry.register(dummyTool);

    const executor = new DefaultToolExecutor();
    const validator = new DefaultToolValidator();
    const runtime = new ToolRuntime(registry, executor, validator);

    const context = {
      requestId: 'req-1',
      traceId: 'trace-1',
      creatorId: 'creator-1',
      workspaceId: 'workspace-1'
    };

    // Succeeding call
    const res1 = await runtime.execute({
      toolName: 'fetch_weather',
      arguments: { city: 'Paris' },
      context
    });
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.status, 'SUCCESS');
    assert.strictEqual(res1.output.temp, 22);

    // Failing call with retries
    const res2 = await runtime.execute({
      toolName: 'fetch_weather',
      arguments: { city: 'fail' },
      context
    }, { maxRetries: 2 });
    
    assert.strictEqual(res2.success, false);
    assert.strictEqual(res2.status, 'RETRY_EXHAUSTED');
    assert.strictEqual(res2.retryCount, 2);

    featureFlags.TOOL_VALIDATION = false;
    featureFlags.TOOL_RETRIES = false;
  });

  await t.test('4. ToolRuntime timeout cancellation', async () => {
    const registry = new ToolRegistry();
    const slowTool: Tool = {
      name: 'slow',
      description: 'slow tool',
      category: 'test',
      schema: {
        name: 'slow',
        description: 'slow tool',
        parameters: { type: 'object', properties: {} }
      },
      execute: async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'done';
      }
    };
    registry.register(slowTool);

    const executor = new DefaultToolExecutor();
    const validator = new DefaultToolValidator();
    const runtime = new ToolRuntime(registry, executor, validator);

    const context = {
      requestId: 'req-2',
      traceId: 'trace-2',
      creatorId: 'creator-2',
      workspaceId: 'workspace-2'
    };

    // Timeout
    const res = await runtime.execute({
      toolName: 'slow',
      arguments: {},
      context
    }, { timeoutMs: 10, maxRetries: 0 });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'TIMEOUT');

    // Signal Cancelled
    const controller = new AbortController();
    const cancelPromise = runtime.execute({
      toolName: 'slow',
      arguments: {},
      context: { ...context, signal: controller.signal }
    });

    controller.abort();
    const resCancel = await cancelPromise;
    assert.strictEqual(resCancel.success, false);
    assert.strictEqual(resCancel.status, 'CANCELLED');
  });

  await t.test('5. ToolResolver routing', async () => {
    const registry = new ToolRegistry();
    registry.register(dummyTool);

    const executor = new DefaultToolExecutor();
    const validator = new DefaultToolValidator();
    const runtime = new ToolRuntime(registry, executor, validator);
    const resolver = new ToolResolver(runtime);

    const context = {
      requestId: 'req-3',
      traceId: 'trace-3',
      creatorId: 'creator-3',
      workspaceId: 'workspace-3'
    };

    // Simulated openai response structure
    const payload = {
      tool_calls: [
        {
          function: {
            name: 'fetch_weather',
            arguments: '{"city": "Berlin"}'
          }
        }
      ]
    };

    const res = await resolver.resolveAndRoute(payload, context);
    assert.strictEqual(res.results.length, 1);
    assert.strictEqual(res.results[0].success, true);
    assert.strictEqual(res.results[0].output.city, 'Berlin');
  });

});
