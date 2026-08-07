import test from 'node:test';
import assert from 'node:assert';
import { DefaultTraceEventBus } from '../services/traceRuntime';
import { LangfuseTraceProvider } from '../providers/langfuse';
import { featureFlags } from '../config/featureFlags';

test('Langfuse Observability Test Suite', async (t) => {

  const originalEnv = { ...process.env };

  const clearEnv = () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.NEXT_PUBLIC_LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_HOST;
    delete process.env.NEXT_PUBLIC_LANGFUSE_HOST;
  };

  await t.test('1. Feature flag defaults', () => {
    assert.strictEqual(featureFlags.LANGFUSE_ENABLED, false);
    assert.strictEqual(featureFlags.LANGFUSE_CAPTURE_INPUT, false);
    assert.strictEqual(featureFlags.LANGFUSE_CAPTURE_OUTPUT, false);
  });

  await t.test('2. Missing credentials / disabled fallback', () => {
    clearEnv();
    featureFlags.LANGFUSE_ENABLED = false;

    const bus = new DefaultTraceEventBus();
    const provider = new LangfuseTraceProvider(bus);

    assert.strictEqual((provider as any).langfuse, undefined);
    provider.dispose();
  });

  await t.test('3. Initialization with custom credentials & host default', () => {
    featureFlags.LANGFUSE_ENABLED = true;
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';

    const bus = new DefaultTraceEventBus();
    const provider = new LangfuseTraceProvider(bus);

    assert.ok((provider as any).langfuse);
    assert.strictEqual((provider as any).langfuse.baseUrl, 'https://cloud.langfuse.com');

    provider.dispose();
    clearEnv();
    featureFlags.LANGFUSE_ENABLED = false;
  });

  await t.test('4. Privacy controls for prompts/outputs and header redactions', async () => {
    featureFlags.LANGFUSE_ENABLED = true;
    featureFlags.LANGFUSE_CAPTURE_INPUT = false;
    featureFlags.LANGFUSE_CAPTURE_OUTPUT = false;

    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';

    const bus = new DefaultTraceEventBus();
    const provider = new LangfuseTraceProvider(bus);

    const tracesCreated: any[] = [];
    const spansCreated: any[] = [];
    const spansUpdated: any[] = [];

    const mockTrace = {
      span: (params: any) => {
        const spanObj = {
          params,
          update: (updateParams: any) => {
            spansUpdated.push(updateParams);
          }
        };
        spansCreated.push(spanObj);
        return spanObj;
      },
      generation: (params: any) => {
        const genObj = {
          params,
          update: (updateParams: any) => {
            spansUpdated.push(updateParams);
          }
        };
        spansCreated.push(genObj);
        return genObj;
      }
    };

    (provider as any).langfuse.trace = (params: any) => {
      tracesCreated.push(params);
      return mockTrace;
    };

    bus.publish({
      traceId: 'tr-123',
      requestId: 'req-456',
      stage: 'generation',
      component: 'MockProvider',
      status: 'started',
      metadata: {
        creatorId: 'user-789',
        inputPrompt: 'Secret prompt content containing API_KEY=abc',
        Authorization: 'Bearer secretToken123'
      }
    });

    assert.strictEqual(tracesCreated.length, 1);
    assert.strictEqual(tracesCreated[0].metadata.Authorization, '[REDACTED]');

    assert.strictEqual(spansCreated.length, 1);
    assert.strictEqual(spansCreated[0].params.input, undefined);

    bus.publish({
      traceId: 'tr-123',
      requestId: 'req-456',
      stage: 'generation',
      component: 'MockProvider',
      status: 'completed',
      metadata: {
        generatedContent: 'Highly confidential generated script text',
        tokenCount: 150
      }
    });

    assert.strictEqual(spansUpdated.length, 1);
    assert.strictEqual(spansUpdated[0].output, undefined);

    provider.dispose();
    clearEnv();
    featureFlags.LANGFUSE_ENABLED = false;
  });

  await t.test('5. Fail-open isolation under client execution crashes', () => {
    featureFlags.LANGFUSE_ENABLED = true;
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';

    const bus = new DefaultTraceEventBus();
    const provider = new LangfuseTraceProvider(bus);

    (provider as any).langfuse.trace = () => {
      throw new Error('Endpoint connection timeout');
    };

    assert.doesNotThrow(() => {
      bus.publish({
        traceId: 'tr-999',
        requestId: 'req-999',
        stage: 'generation',
        component: 'MockProvider',
        status: 'started',
        metadata: {}
      });
    });

    provider.dispose();
    clearEnv();
    featureFlags.LANGFUSE_ENABLED = false;
  });

  Object.assign(process.env, originalEnv);
});
