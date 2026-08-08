import test from 'node:test';
import assert from 'node:assert';
import { featureFlags } from '../config/featureFlags';
import { StdioTransport } from '../transport/stdio';
import { HttpTransport } from '../transport/http';
import { MCPClientHub } from '../client';
import { MCPMessage, MCPTool } from '../types';
import { policyRuntime } from '../../policy';
import { traceEventBus } from '../../observability';

test('Production MCP Hub Test Suite', async (t) => {

  await t.test('1. Feature flag defaults', () => {
    assert.strictEqual(featureFlags.MCP_EXTERNAL_SERVERS, false);
    assert.strictEqual(featureFlags.MCP_STDIO, false);
    assert.strictEqual(featureFlags.MCP_HTTP, false);
  });

  await t.test('2. StdioTransport executable validation', async () => {
    assert.throws(() => {
      new StdioTransport('node; rm -rf /');
    }, /Invalid stdio executable command/);
  });

  await t.test('3. HttpTransport SSRF validation filtering', async () => {
    assert.throws(() => {
      new HttpTransport('http://localhost:8080/mcp');
    }, /SSRF Prevention/);

    assert.throws(() => {
      new HttpTransport('https://192.168.1.100/mcp');
    }, /SSRF Prevention/);

    const transport = new HttpTransport('https://api.external-mcp-hub.com/mcp');
    assert.ok(transport);
  });

  await t.test('4. MCPClientHub initialization flow and capability negotiation', async () => {
    const hub = new MCPClientHub();

    const messagesSent: MCPMessage[] = [];
    let messageHandler: ((message: MCPMessage) => void) | null = null;

    const mockTransport = {
      connect: async () => {},
      disconnect: async () => {},
      send: async (msg: MCPMessage) => {
        messagesSent.push(msg);
        if (msg.method === 'initialize') {
          setTimeout(() => {
            if (messageHandler) {
              messageHandler({
                jsonrpc: '2.0',
                id: msg.id,
                result: {
                  protocolVersion: '2024-11-05',
                  capabilities: {
                    tools: true
                  },
                  serverInfo: { name: 'mock-server', version: '1.0' }
                }
              });
            }
          }, 5);
        } else if (msg.method === 'tools/list') {
          setTimeout(() => {
            if (messageHandler) {
              messageHandler({
                jsonrpc: '2.0',
                id: msg.id,
                result: {
                  tools: [{ name: 'calculator', description: 'adds numbers', schema: {} }]
                }
              });
            }
          }, 5);
        }
      },
      onMessage: (cb: (msg: MCPMessage) => void) => {
        messageHandler = cb;
      },
      onClose: () => {}
    };

    const session = await hub.connect('server-abc', mockTransport);
    assert.ok(session);
    assert.strictEqual(session.serverId, 'server-abc');
    assert.strictEqual(session.status, 'CONNECTED');

    await new Promise(resolve => setTimeout(resolve, 20));

    assert.strictEqual(messagesSent.length, 3);
    assert.strictEqual(messagesSent[0].method, 'initialize');
    assert.strictEqual(messagesSent[1].method, 'notifications/initialized');
    assert.strictEqual(messagesSent[2].method, 'tools/list');

    const tools = hub.getTools('server-abc');
    assert.strictEqual(tools.length, 1);
    assert.strictEqual(tools[0].name, 'calculator');

    await hub.dispose();
  });

  await t.test('5. Pre-tool policy rejection and tenant context isolation', async () => {
    const hub = new MCPClientHub();
    
    const mockTransport = {
      connect: async () => {},
      disconnect: async () => {},
      send: async () => {},
      onMessage: () => {},
      onClose: () => {}
    };

    (hub as any).pipelines.set('server-xyz', {
      sendRequest: async () => ({})
    });
    (hub as any).sessions.set('server-xyz', {
      sessionId: 'sess-xyz',
      serverId: 'server-xyz',
      status: 'CONNECTED',
      createdAt: new Date().toISOString()
    });

    const originalEvaluate = policyRuntime.evaluate;
    policyRuntime.evaluate = async (stage, content, context) => {
      if (context.metadata?.toolName === 'delete_database') {
        return {
          stage,
          passed: false,
          originalContent: content,
          finalContent: content,
          modified: false,
          modifications: [],
          warnings: [],
          errors: [{ policyId: 'block-delete', error: 'Unauthorized tool access' }],
          durationMs: 1
        };
      }
      return {
        stage,
        passed: true,
        originalContent: content,
        finalContent: content,
        modified: false,
        modifications: [],
        warnings: [],
        errors: [],
        durationMs: 1
      };
    };

    await assert.rejects(async () => {
      await hub.invokeTool('server-xyz', 'delete_database', {}, {
        tenantId: 'tenant-evil',
        workspaceId: 'ws-evil',
        creatorId: 'user-evil'
      });
    }, /blocked by policy rules/);

    await assert.doesNotReject(async () => {
      await hub.invokeTool('server-xyz', 'get_weather', { location: 'San Francisco' }, {
        tenantId: 'tenant-ok',
        workspaceId: 'ws-ok',
        creatorId: 'user-ok'
      });
    });

    policyRuntime.evaluate = originalEvaluate;
  });

  await t.test('6. Secrets scrubbing in telemetry parameter payloads', async () => {
    const hub = new MCPClientHub();

    const payload = {
      secretToken: 'sensitive-jwt-token-12345',
      userEmail: 'user@example.com',
      nested: {
        password: 'unencryptedpassword'
      }
    };

    const clean = (hub as any).scrubSecrets(payload);
    assert.strictEqual(clean.secretToken, '[REDACTED]');
    assert.strictEqual(clean.nested.password, '[REDACTED]');
    assert.strictEqual(clean.userEmail, 'user@example.com');
  });

  await t.test('7. Tracing traceId/correlationId propagation', async () => {
    const hub = new MCPClientHub();
    const traceEvents: any[] = [];
    const unsubscribe = traceEventBus.subscribe((evt: any) => {
      traceEvents.push(evt);
    });

    (hub as any).pipelines.set('server-trace', {
      sendRequest: async () => ({})
    });
    (hub as any).sessions.set('server-trace', {
      sessionId: 'sess-trace',
      serverId: 'server-trace',
      status: 'CONNECTED',
      createdAt: new Date().toISOString()
    });

    await hub.invokeTool('server-trace', 'read_logs', {}, {
      tenantId: 't-1',
      workspaceId: 'ws-1',
      creatorId: 'u-1',
      traceId: 'custom-trace-id-abc'
    });

    unsubscribe();

    const hasTraceEvent = traceEvents.some(evt => evt.traceId === 'custom-trace-id-abc');
    assert.ok(hasTraceEvent);
  });
});
