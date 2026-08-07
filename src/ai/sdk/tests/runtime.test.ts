import test from 'node:test';
import assert from 'node:assert';
import { 
  SDKGenerator, 
  SDKClient, 
  FetchHttpTransport, 
  JSONSerializer, 
  featureFlags, 
  HttpResponse, 
  HttpRequestOptions, 
  SDKError 
} from '../index';

test('SDK Runtime Test Suite', async (t) => {

  await t.test('1. SDK code generator compilation from OpenAPI schema', () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/v1/agents': {
          post: {
            summary: 'Create agent',
            description: 'Saves agent configuration',
            requestBody: { required: true }
          }
        }
      }
    };

    const generator = new SDKGenerator();
    const sourceCode = generator.generateTS(spec);
    
    assert.ok(sourceCode.includes('class GeneratedSDKClient extends SDKClient'));
    assert.ok(sourceCode.includes('public async postAgents'));
    assert.ok(sourceCode.includes('Create agent'));
    assert.ok(sourceCode.includes("method: 'POST'"));
  });

  await t.test('2. Request & Response Interceptors processing sequence', async () => {
    featureFlags.SDK_RUNTIME = true;

    try {
      const mockTransport = {
        request: async (opts: HttpRequestOptions): Promise<HttpResponse> => ({
          status: 200,
          data: { originalData: opts.body },
          headers: {}
        })
      };

      const client = new SDKClient({ baseUrl: 'http://mock-api' }, mockTransport);

      client.registerInterceptor({
        request: (opts) => {
          const headers = { ...opts.headers, 'X-Custom-Req': 'val-req' };
          return { ...opts, headers };
        },
        response: (res) => {
          const data = { ...res.data, responseModified: true };
          return { ...res, data };
        }
      });

      let requestCapturedHeaders: any;
      client.registerMiddleware(async (opts, next) => {
        requestCapturedHeaders = opts.headers;
        return next();
      });

      const result = await client.request({
        method: 'POST',
        url: '/v1/agents',
        body: { name: 'agent-1' }
      });

      assert.strictEqual(requestCapturedHeaders['X-Custom-Req'], 'val-req');
      assert.strictEqual(result.responseModified, true);
    } finally {
      featureFlags.SDK_RUNTIME = false;
    }
  });

  await t.test('3. Client automatic retries with backoffs', async () => {
    featureFlags.SDK_RUNTIME = true;

    try {
      let callsCount = 0;
      const mockTransport = {
        request: async (): Promise<HttpResponse> => {
          callsCount++;
          if (callsCount < 3) {
            return { status: 503, data: { error: { code: 'UNAVAILABLE', message: 'Transient error' } }, headers: {} };
          }
          return { status: 200, data: { ok: true }, headers: {} };
        }
      };

      const client = new SDKClient({ baseUrl: 'http://mock-api', retries: 2 }, mockTransport);
      const result = await client.request({ method: 'GET', url: '/v1/health' });

      assert.strictEqual(result.ok, true);
      assert.strictEqual(callsCount, 3);
    } finally {
      featureFlags.SDK_RUNTIME = false;
    }
  });

  await t.test('4. JSON payload serialization and deserialization', () => {
    const serializer = new JSONSerializer();
    const payload = { a: 1, b: 'two' };
    const str = serializer.serialize(payload);
    assert.strictEqual(str, '{"a":1,"b":"two"}');

    const parsed = serializer.deserialize(str);
    assert.deepStrictEqual(parsed, payload);
  });

  await t.test('5. Request AbortController cancellations', async () => {
    featureFlags.SDK_RUNTIME = true;

    try {
      const mockTransport = {
        request: async (opts: HttpRequestOptions): Promise<HttpResponse> => {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => resolve(null), 500);
            if (opts.abortSignal) {
              opts.abortSignal.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new DOMException('The user aborted a request.', 'AbortError'));
              });
            }
          });
          return { status: 200, data: { ok: true }, headers: {} };
        }
      };

      const client = new SDKClient({ baseUrl: 'http://mock-api' }, mockTransport);
      const controller = new AbortController();

      setTimeout(() => controller.abort(), 50);

      await assert.rejects(async () => {
        await client.request({
          method: 'GET',
          url: '/v1/memory',
          abortSignal: controller.signal
        });
      }, (err: any) => {
        return err instanceof SDKError && err.code === 'CANCELLED';
      });
    } finally {
      featureFlags.SDK_RUNTIME = false;
    }
  });

  await t.test('6. Feature flags defaults', () => {
    assert.strictEqual(featureFlags.SDK_RUNTIME, false);
    assert.strictEqual(featureFlags.SDK_STREAMING, false);
    assert.strictEqual(featureFlags.SDK_GENERATOR, false);
  });

});
