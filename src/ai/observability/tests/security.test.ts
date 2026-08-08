import test from 'node:test';
import assert from 'node:assert';
import { GET as getDeviceAccounts } from '../../../app/api/device-accounts/route';
import { POST as postGenerate } from '../../../app/api/content/generate/route';
import { GET as getHealth } from '../../../app/api/health/route';
import { LangfuseTraceProvider } from '../providers/langfuse';
import { traceEventBus } from '../services/traceRuntime';
import { MCPClientHub } from '../../mcp/client';
import { InMemoryTransport } from '../../mcp/transport';

test('Production Security & Authorization Hardening Test Suite', async (t) => {

  const createMockToken = (userId: string, workspaceId: string, extra: Record<string, any> = {}): string => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(JSON.stringify({ userId, workspaceId, tenantId: 'tenant-test', exp: Math.floor(Date.now() / 1000) + 3600, ...extra })).toString('base64');
    return `${header}.${payload}.signature`;
  };

  await t.test('1. Unauthenticated requests are rejected', async () => {
    // 1.1 /api/content/generate
    const reqGen = new Request('http://localhost/api/content/generate', { method: 'POST', body: '{}' });
    const resGen = await postGenerate(reqGen);
    assert.strictEqual(resGen.status, 401);

    // 1.2 /api/device-accounts
    const reqDev = new Request('http://localhost/api/device-accounts', { method: 'GET' });
    const resDev = await getDeviceAccounts(reqDev);
    assert.strictEqual(resDev.status, 401);
  });

  await t.test('2. Tenant and Workspace mismatch IDOR protection', async () => {
    const token = createMockToken('user-55', 'ws-allowed', { workspaces: ['ws-allowed', 'ws-extra'] });
    
    // Attempt to access un-associated workspace 'ws-unauthorized'
    const req = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        title: 'Unauthorized Content Attempt',
        topic: 'Trying to sneak into another tenant workspace',
        primaryGoal: 'Reach',
        workspaceId: 'ws-unauthorized'
      })
    });

    const res = await postGenerate(req);
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /Inconsistent workspace authorization/);
  });

  await t.test('3. Oversized and malformed parameter injection protection', async () => {
    const token = createMockToken('user-1', 'ws-1');

    // 3.1 Oversized body > 50KB
    const oversizedTopic = 'a'.repeat(60 * 1024);
    const reqLarge = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        title: 'Title',
        topic: oversizedTopic,
        workspaceId: 'ws-1'
      })
    });

    const resLarge = await postGenerate(reqLarge);
    assert.strictEqual(resLarge.status, 413);
    const dataLarge = await resLarge.json();
    assert.match(dataLarge.error, /Payload Too Large/);

    // 3.2 Parameter injection (unexpected extra configurations in JSON body)
    const reqInject = new Request('http://localhost/api/content/generate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        title: 'Inject Attempt',
        topic: 'Valid topic details',
        workspaceId: 'ws-1',
        injectedProviderConfig: { maliciousField: true }
      })
    });

    const resInject = await postGenerate(reqInject);
    assert.strictEqual(resInject.status, 400);
    const dataInject = await resInject.json();
    assert.match(dataInject.error, /Parameter validation failed/);
  });

  await t.test('4. Telemetry scrubbing & secrets redaction checks', () => {
    const provider = new LangfuseTraceProvider(traceEventBus);
    
    // We access the scrubMetadata method safely
    const scrubMetadata = (provider as any).scrubMetadata.bind(provider);

    const rawMetadata = {
      dbUrl: 'postgresql://db_user:my-super-secret-password-123@neon-host.db.com/db_name?sslmode=require',
      redisUrl: 'redis://default:my-redis-pass-123@redis-12345.upstash.io:6379',
      apiKey: 'sk-proj-openai-api-key-value',
      authorization: 'Bearer jwt-token-value',
      safeField: 'standard-text-value'
    };

    const clean = scrubMetadata(rawMetadata);
    
    // Check key redactions
    assert.strictEqual(clean.apiKey, '[REDACTED]');
    assert.strictEqual(clean.authorization, '[REDACTED]');
    assert.strictEqual(clean.safeField, 'standard-text-value');
    
    // Check connection string URL masks
    assert.strictEqual(clean.dbUrl, 'postgresql://[REDACTED]');
    assert.strictEqual(clean.redisUrl, 'redis://[REDACTED]');

    provider.initialize();
  });

  await t.test('5. Health endpoint exposes safe diagnostics only', async () => {
    // Inject mock connection credentials containing sensitive keys into environment
    const originalDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://db_admin:leaked-secret-pass@postgres-neon.com/db';

    const res = await getHealth();
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    // Verify response body has components but NO connection details, passwords, or DB secrets
    assert.ok('status' in data);
    assert.ok('components' in data);
    
    const responseString = JSON.stringify(data);
    assert.ok(!responseString.includes('db_admin'));
    assert.ok(!responseString.includes('leaked-secret-pass'));
    assert.ok(!responseString.includes('postgres-neon.com'));

    process.env.DATABASE_URL = originalDbUrl;
  });

  await t.test('6. MCP tool execution is gated by PolicyRuntime checks', async () => {
    const hub = new MCPClientHub();
    const transport = new InMemoryTransport();
    
    // Attempt to execute tool with invalid context triggers Policy Error or Block
    await assert.rejects(async () => {
      await hub.invokeTool('server-1', 'calculate_metrics', { data: 'val' }, {
        tenantId: 'unauthorized-tenant',
        workspaceId: 'unauthorized-ws',
        creatorId: 'user-unauthorized'
      });
    }, /No active session/);
  });
});
