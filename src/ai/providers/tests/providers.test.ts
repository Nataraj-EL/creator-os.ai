import test from 'node:test';
import assert from 'node:assert';
import { 
  providerRegistry, 
  providerResolver,
  ProviderRegistry,
  MockProvider,
  ExponentialBackoffRetryPolicy,
  DefaultTimeoutPolicy,
  ProviderRuntime,
  ProviderError,
  featureFlags
} from '../index';
import { generateContent } from '../../../lib/generationService';

test('AI Provider Runtime Test Suite', async (t) => {

  t.beforeEach(() => {
    providerRegistry.clear();
    // Re-register fresh MockProvider
    providerRegistry.register(new MockProvider());
    providerRegistry.setDefaultProvider('mock');
  });

  await t.test('1. Provider Registry Registration & Unregistration', () => {
    const customMock = new MockProvider();
    customMock.name = 'custom-llm';
    
    providerRegistry.register(customMock);
    const resolved = providerRegistry.resolve('custom-llm');
    assert.strictEqual(resolved.name, 'custom-llm');

    providerRegistry.unregister('custom-llm');
    assert.throws(() => providerRegistry.resolve('custom-llm'), /not registered/);
  });

  await t.test('2. Provider Resolver Routing & Defaults', () => {
    const resolvedDefault = providerResolver.resolve();
    assert.strictEqual(resolvedDefault.name, 'mock');

    const resolvedSpecific = providerResolver.resolve('Mock');
    assert.strictEqual(resolvedSpecific.name, 'mock');
  });

  await t.test('3. Expanded Capabilities Properties', () => {
    const mock = providerRegistry.resolve('mock') as MockProvider;
    mock.setCapabilities({
      tools: false,
      jsonMode: true,
      vision: false
    });

    const caps = mock.capabilities;
    assert.strictEqual(caps.streaming, true);
    assert.strictEqual(caps.tools, false);
    assert.strictEqual(caps.jsonMode, true);
    assert.strictEqual(caps.vision, false);
    assert.strictEqual(caps.functionCalling, true);
  });

  await t.test('4. Timeout Policy & Cancellation', async () => {
    const timeoutPolicy = new DefaultTimeoutPolicy(50); // 50ms timeout
    
    // Slow operation
    const slowOp = async (signal: AbortSignal) => {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 200);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Aborted'));
        });
      });
      return 'success';
    };

    await assert.rejects(
      async () => await timeoutPolicy.execute(slowOp),
      (err: any) => {
        assert.ok(err instanceof ProviderError);
        assert.strictEqual(err.code, 'TIMEOUT');
        return true;
      }
    );

    // Cancelled operation
    const controller = new AbortController();
    const immediateCancelOp = async (signal: AbortSignal) => {
      if (signal.aborted) throw new Error('Aborted');
      return 'should-not-reach';
    };

    controller.abort();
    await assert.rejects(
      async () => await timeoutPolicy.execute(immediateCancelOp, controller.signal),
      (err: any) => {
        assert.ok(err instanceof ProviderError);
        assert.strictEqual(err.code, 'CANCELLED');
        return true;
      }
    );
  });

  await t.test('5. Reusable Retry Policy with Exponential Backoff', async () => {
    const retryPolicy = new ExponentialBackoffRetryPolicy(3, 10, 2, true);
    let attempts = 0;

    // Operation that fails 2 times and succeeds on the 3rd attempt (attempt index = 2)
    const successOnThird = async (attempt: number) => {
      attempts = attempt;
      if (attempt < 2) {
        throw new Error('Transient error');
      }
      return 'success-payload';
    };

    const result = await retryPolicy.execute(successOnThird);
    assert.strictEqual(result, 'success-payload');
    assert.strictEqual(attempts, 2, 'Should succeed on the 3rd attempt (index 2)');

    // Operation that always fails
    const alwaysFail = async () => {
      throw new Error('Persistent failure');
    };
    await assert.rejects(
      async () => await retryPolicy.execute(alwaysFail),
      /Persistent failure/
    );
  });

  await t.test('6. Fail-Open Error Mapping in Runtime', async () => {
    const registry = new ProviderRegistry();
    const mock = new MockProvider();
    registry.register(mock);
    
    const retryPolicy = new ExponentialBackoffRetryPolicy(1, 10, 2, false);
    const timeoutPolicy = new DefaultTimeoutPolicy(5000);
    const runtime = new ProviderRuntime(registry, retryPolicy, timeoutPolicy);

    mock.setError(new Error('Upstream rate limit reached: 429 too many requests'));
    await assert.rejects(
      async () => await runtime.generate(mock, { prompt: 'hi' }),
      (err: any) => {
        assert.ok(err instanceof ProviderError);
        assert.strictEqual(err.code, 'RATE_LIMIT');
        return true;
      }
    );

    mock.setError(new Error('Upstream auth failed: 401 unauthorized'));
    await assert.rejects(
      async () => await runtime.generate(mock, { prompt: 'hi' }),
      (err: any) => {
        assert.ok(err instanceof ProviderError);
        assert.strictEqual(err.code, 'AUTH_ERROR');
        return true;
      }
    );
  });

  await t.test('7. End-to-End Generation & Trace Integration', async () => {
    featureFlags.PROVIDERS_ENABLED = true;
    featureFlags.RETRY_ENABLED = true;

    // Register a mock provider under the requested name
    const mock = new MockProvider();
    mock.name = 'Backend-API';
    mock.setMockResponse('Custom generated content for trace integration checks.');
    providerRegistry.register(mock);

    const result = await generateContent(
      'creator-abc',
      'workspace-xyz',
      'Script Title',
      'Write a video hook script about AI',
      'High engagement'
    );

    assert.ok(result.data);
    assert.strictEqual(result.data.generatedContent, 'Custom generated content for trace integration checks.');

    // Disable flags back
    featureFlags.PROVIDERS_ENABLED = false;
    featureFlags.RETRY_ENABLED = false;
  });

});
