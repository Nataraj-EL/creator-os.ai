import test from 'node:test';
import assert from 'node:assert';
import { 
  InMemoryConfigProvider, 
  InMemorySecretProvider, 
  SecureConfigCache, 
  ConfigRuntime, 
  ConfigSchema, 
  featureFlags, 
  ConfigSource 
} from '../index';

test('Configuration & Secrets Runtime Test Suite', async (t) => {

  await t.test('1. SecureConfigCache transient encryption checks', () => {
    const cache = new SecureConfigCache();
    
    // Non-secret values are plaintext in cache internal maps
    cache.set('db.host', 'localhost', false);
    assert.strictEqual(cache.get('db.host'), 'localhost');

    // Secrets are encrypted in heap
    cache.set('api.key', 'super-secret-key-123', true);
    assert.strictEqual(cache.get('api.key'), 'super-secret-key-123');

    // Confirm that the internal Map does NOT store the plaintext string "super-secret-key-123"
    const internalMap = (cache as any).cache;
    const cacheItem = internalMap.get('api.key');
    assert.ok(cacheItem.isSecret);
    assert.ok(typeof cacheItem.value === 'string');
    assert.strictEqual(cacheItem.value.includes('super-secret-key-123'), false); // plaintext absent
  });

  await t.test('2. Layer precedence resolution defaults -> env -> user -> runtime', async () => {
    featureFlags.CONFIG_RUNTIME = true;
    
    const layers = new Map<ConfigSource, InMemoryConfigProvider>([
      ['ENV', new InMemoryConfigProvider()],
      ['USER', new InMemoryConfigProvider()],
      ['RUNTIME', new InMemoryConfigProvider()]
    ]);

    const secretProvider = new InMemorySecretProvider();
    const schema: ConfigSchema = {
      'db.port': { type: 'number', default: 5432 }
    };
    
    const runtime = new ConfigRuntime(layers as any, secretProvider, schema);

    // Default layer check
    let port = await runtime.get('db.port');
    assert.strictEqual(port, 5432);

    // ENV overrides DEFAULT
    await layers.get('ENV')?.set('db.port', 5433);
    runtime.hotReload(); // clear resolved cache
    port = await runtime.get('db.port');
    assert.strictEqual(port, 5433);

    // RUNTIME overrides ENV
    await layers.get('RUNTIME')?.set('db.port', 5434);
    runtime.hotReload();
    port = await runtime.get('db.port');
    assert.strictEqual(port, 5434);

    featureFlags.CONFIG_RUNTIME = false;
  });

  await t.test('3. Secret placeholders string interpolation and resolution', async () => {
    featureFlags.CONFIG_RUNTIME = true;
    featureFlags.SECRET_PROVIDER = true;

    const layers = new Map<ConfigSource, InMemoryConfigProvider>([
      ['ENV', new InMemoryConfigProvider()]
    ]);
    const secretProvider = new InMemorySecretProvider();
    
    await layers.get('ENV')?.set('app.secret', '${secret:MY_DB_PASSWORD}');
    await secretProvider.setSecret('MY_DB_PASSWORD', 'my-actual-secure-pass');

    const schema: ConfigSchema = {
      'app.secret': { type: 'string' }
    };
    const runtime = new ConfigRuntime(layers as any, secretProvider, schema);

    const resolved = await runtime.get('app.secret');
    assert.strictEqual(resolved, 'my-actual-secure-pass');

    featureFlags.CONFIG_RUNTIME = false;
    featureFlags.SECRET_PROVIDER = false;
  });

  await t.test('4. Secret rotation invalidates configuration cache', async () => {
    featureFlags.CONFIG_RUNTIME = true;
    featureFlags.SECRET_PROVIDER = true;

    const layers = new Map<ConfigSource, InMemoryConfigProvider>([
      ['ENV', new InMemoryConfigProvider()]
    ]);
    const secretProvider = new InMemorySecretProvider();
    
    await layers.get('ENV')?.set('app.secret', '${secret:MY_API_KEY}');
    await secretProvider.setSecret('MY_API_KEY', 'key-v1');

    const schema: ConfigSchema = {
      'app.secret': { type: 'string' }
    };
    const runtime = new ConfigRuntime(layers as any, secretProvider, schema);

    // First fetch
    let key = await runtime.get('app.secret');
    assert.strictEqual(key, 'key-v1');

    // Update secret (rotation)
    await secretProvider.setSecret('MY_API_KEY', 'key-v2');

    // Fetch again (should fetch from secret provider due to auto-invalidation on rotation)
    key = await runtime.get('app.secret');
    assert.strictEqual(key, 'key-v2');

    featureFlags.CONFIG_RUNTIME = false;
    featureFlags.SECRET_PROVIDER = false;
  });

  await t.test('5. Advanced Schema Validation (nested properties, custom validators, fail-fast)', async () => {
    featureFlags.CONFIG_RUNTIME = true;

    const layers = new Map<ConfigSource, InMemoryConfigProvider>([
      ['RUNTIME', new InMemoryConfigProvider()]
    ]);
    const secretProvider = new InMemorySecretProvider();

    const schema: ConfigSchema = {
      database: {
        type: 'object',
        required: true,
        properties: {
          host: { type: 'string', required: true },
          port: { 
            type: 'number', 
            required: true,
            validate: (val) => val > 0 && val < 65536 ? true : 'Port number invalid.'
          }
        }
      }
    };

    const runtime = new ConfigRuntime(layers as any, secretProvider, schema);

    // Set invalid data (missing port)
    await layers.get('RUNTIME')?.set('database', { host: 'localhost' });
    
    await assert.rejects(async () => {
      await runtime.get('database');
    }, /Configuration Validation Failed/);

    // Set valid nested object
    await layers.get('RUNTIME')?.set('database', { host: 'localhost', port: 8080 });
    const db = await runtime.get('database');
    assert.strictEqual(db.host, 'localhost');
    assert.strictEqual(db.port, 8080);

    featureFlags.CONFIG_RUNTIME = false;
  });

  await t.test('6. Hot reload and debounced change subscription updates', async () => {
    featureFlags.CONFIG_RUNTIME = true;
    featureFlags.CONFIG_HOT_RELOAD = true;

    const layers = new Map<ConfigSource, InMemoryConfigProvider>([
      ['ENV', new InMemoryConfigProvider()]
    ]);
    const secretProvider = new InMemorySecretProvider();
    const schema: ConfigSchema = {};
    const runtime = new ConfigRuntime(layers as any, secretProvider, schema);

    let eventCount = 0;
    runtime.addListener((ev) => {
      if (ev.type === 'CONFIG_LOADED') {
        eventCount++;
      }
    });

    // Make multiple updates rapidly
    await runtime.set('ENV', 'key.1', 'val1');
    await runtime.set('ENV', 'key.2', 'val2');

    // Wait for debounce period (50ms)
    await new Promise(resolve => setTimeout(resolve, 80));

    // Multiple updates should be grouped into a single debounced CONFIG_LOADED event
    assert.strictEqual(eventCount, 1);

    featureFlags.CONFIG_RUNTIME = false;
    featureFlags.CONFIG_HOT_RELOAD = false;
  });

  await t.test('7. Feature flags defaults', () => {
    assert.strictEqual(featureFlags.CONFIG_RUNTIME, false);
    assert.strictEqual(featureFlags.SECRET_PROVIDER, false);
    assert.strictEqual(featureFlags.CONFIG_HOT_RELOAD, false);
  });

});
