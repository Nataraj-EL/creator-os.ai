import test from 'node:test';
import assert from 'node:assert';
import { 
  MCPRegistry,
  MCPCapabilityRegistry,
  RegistryDiscoveryProvider,
  InMemoryResourceCache,
  InMemoryTransport,
  SessionManager,
  MCPRuntime,
  MCPToolAdapter,
  featureFlags,
  MCPServer,
  MCPTool
} from '../index';
import { ToolRegistry, DefaultToolExecutor, DefaultToolValidator, ToolRuntime } from '../../tools';

test('MCP Runtime Test Suite', async (t) => {

  const registry = new MCPRegistry();
  const capabilityRegistry = new MCPCapabilityRegistry();
  const sessionManager = new SessionManager(capabilityRegistry);
  const cache = new InMemoryResourceCache();
  const discovery = new RegistryDiscoveryProvider(registry);

  const serverProfile: MCPServer = {
    id: 'mcp-server-1',
    name: 'WeatherServer',
    version: '1.0.0',
    capabilities: { tools: true, resources: true, prompts: true }
  };

  await t.test('1. MCPRegistry registration & discovery', async () => {
    registry.register(serverProfile);
    const resolved = registry.resolve('mcp-server-1');
    assert.strictEqual(resolved.name, 'WeatherServer');

    const discovered = await discovery.discoverServers();
    assert.strictEqual(discovered.length, 1);
    assert.strictEqual(discovered[0].id, 'mcp-server-1');
  });

  await t.test('2. Transport loop & Session Lifecycle', async () => {
    const clientTransport = new InMemoryTransport();
    const serverTransport = new InMemoryTransport();
    clientTransport.setPartner(serverTransport);
    serverTransport.setPartner(clientTransport);
    await serverTransport.connect();

    // Mock server response handler
    serverTransport.onMessage((msg) => {
      if (msg.method === 'tools/list') {
        serverTransport.send({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            tools: [
              { name: 'get_forecast', description: 'Weather forecast', schema: { type: 'object', properties: {} } }
            ]
          }
        });
      }
    });

    const runtime = new MCPRuntime(registry, sessionManager, cache, discovery);
    const session = await runtime.connect('mcp-server-1', clientTransport);

    assert.strictEqual(session.status, 'CONNECTED');
    assert.strictEqual(sessionManager.getSession('mcp-server-1')?.sessionId, session.sessionId);
    assert.ok(capabilityRegistry.hasCapability('mcp-server-1', 'tools'));

    const tools = await runtime.discoverTools('mcp-server-1');
    assert.strictEqual(tools.length, 1);
    assert.strictEqual(tools[0].name, 'get_forecast');

    // Test session disconnect
    await runtime.disconnect('mcp-server-1');
    assert.strictEqual(sessionManager.getSession('mcp-server-1'), null);
  });

  await t.test('3. Reconnect counters & session resets', async () => {
    const clientTransport = new InMemoryTransport();
    const serverTransport = new InMemoryTransport();
    clientTransport.setPartner(serverTransport);
    serverTransport.setPartner(clientTransport);
    await serverTransport.connect();

    const runtime = new MCPRuntime(registry, sessionManager, cache, discovery);
    await runtime.connect('mcp-server-1', clientTransport);

    // Manually trigger reconnect
    const reconnectedSession = await sessionManager.handleReconnect('mcp-server-1');
    assert.strictEqual(reconnectedSession.status, 'CONNECTED');
    assert.strictEqual(sessionManager.getReconnectCount('mcp-server-1'), 1);

    await runtime.disconnect('mcp-server-1');
  });

  await t.test('4. Resource cache read operations', async () => {
    featureFlags.MCP_CACHING = true;
    cache.clear();

    const clientTransport = new InMemoryTransport();
    const serverTransport = new InMemoryTransport();
    clientTransport.setPartner(serverTransport);
    serverTransport.setPartner(clientTransport);
    await serverTransport.connect();

    serverTransport.onMessage((msg) => {
      if (msg.method === 'resources/read') {
        serverTransport.send({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            contents: [{ text: 'Dynamic Weather Forecast Content!' }]
          }
        });
      }
    });

    const runtime = new MCPRuntime(registry, sessionManager, cache, discovery);
    await runtime.connect('mcp-server-1', clientTransport);

    // First read: should query remote server and cache content
    const content = await runtime.readResource('mcp-server-1', 'mcp://weather/forecast');
    assert.strictEqual(content, 'Dynamic Weather Forecast Content!');

    const cachedContent = await cache.get('mcp://weather/forecast');
    assert.strictEqual(cachedContent, 'Dynamic Weather Forecast Content!');

    // Modify server response: if cache works, it will still yield cached content
    serverTransport.onMessage((msg) => {
      if (msg.method === 'resources/read') {
        serverTransport.send({
          jsonrpc: '2.0',
          id: msg.id,
          result: { contents: [{ text: 'New Changed Content!' }] }
        });
      }
    });

    const contentSecond = await runtime.readResource('mcp-server-1', 'mcp://weather/forecast');
    assert.strictEqual(contentSecond, 'Dynamic Weather Forecast Content!'); // yields cached content!

    await runtime.disconnect('mcp-server-1');
    featureFlags.MCP_CACHING = false;
  });

  await t.test('5. ToolRuntime adapter integration', async () => {
    const clientTransport = new InMemoryTransport();
    const serverTransport = new InMemoryTransport();
    clientTransport.setPartner(serverTransport);
    serverTransport.setPartner(clientTransport);
    await serverTransport.connect();

    serverTransport.onMessage((msg) => {
      if (msg.method === 'tools/call') {
        serverTransport.send({
          jsonrpc: '2.0',
          id: msg.id,
          result: { output: 'Sunny, 24C' }
        });
      }
    });

    const runtime = new MCPRuntime(registry, sessionManager, cache, discovery);
    await runtime.connect('mcp-server-1', clientTransport);

    const mcpTool: MCPTool = {
      name: 'get_forecast',
      description: 'Get weather forecast',
      schema: {
        type: 'object',
        properties: { city: { type: 'string' } }
      }
    };

    // Instantiate Tool Adapter
    const toolAdapter = new MCPToolAdapter(runtime, 'mcp-server-1', mcpTool);

    // Register adapter inside existing ToolRuntime registry
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(toolAdapter);

    const executor = new DefaultToolExecutor();
    const validator = new DefaultToolValidator();
    const toolRuntime = new ToolRuntime(toolRegistry, executor, validator);

    // Invoke through existing ToolRuntime executor
    const res = await toolRuntime.execute({
      toolName: 'get_forecast',
      arguments: { city: 'Paris' },
      context: {
        requestId: 'mcp-req-1',
        traceId: 'mcp-trace-1',
        creatorId: 'mcp-creator',
        workspaceId: 'mcp-workspace'
      }
    });
    assert.strictEqual(res.status, 'SUCCESS');
    assert.strictEqual(res.output.output, 'Sunny, 24C');

    await runtime.disconnect('mcp-server-1');
  });

  await t.test('6. Feature flags backward compatibility', () => {
    assert.strictEqual(featureFlags.MCP_RUNTIME, false);
    assert.strictEqual(featureFlags.MCP_REMOTE, false);
    assert.strictEqual(featureFlags.MCP_CACHING, false);
  });

});
