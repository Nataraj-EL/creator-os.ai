import { 
  MCPServer, 
  MCPSession, 
  MCPTool, 
  MCPResource, 
  MCPPrompt, 
  MCPTransport,
  MCPMessage
} from './types';
import { RequestPipeline } from './pipeline';
import { policyRuntime } from '../policy';
import { traceEventBus } from '../observability';

export class MCPClientHub {
  private sessions: Map<string, MCPSession> = new Map();
  private transports: Map<string, MCPTransport> = new Map();
  private pipelines: Map<string, RequestPipeline> = new Map();
  private capabilities: Map<string, any> = new Map();
  private tools: Map<string, MCPTool[]> = new Map();
  private resources: Map<string, MCPResource[]> = new Map();
  private prompts: Map<string, MCPPrompt[]> = new Map();

  constructor() {}

  public async connect(
    serverId: string,
    transport: MCPTransport,
    options: { timeout?: number } = {}
  ): Promise<MCPSession> {
    await this.disconnect(serverId).catch(() => {});

    traceEventBus.publish({
      traceId: `trace-mcp-${serverId}`,
      requestId: `req-mcp-${serverId}`,
      stage: 'mcp',
      component: 'MCPClientHub',
      status: 'started',
      metadata: { serverId }
    });

    try {
      await transport.connect();

      this.transports.set(serverId, transport);
      const pipeline = new RequestPipeline(transport);
      this.pipelines.set(serverId, pipeline);

      const initResponse = await pipeline.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
          sampling: {}
        },
        clientInfo: {
          name: 'creator-os-client',
          version: '1.0.0'
        }
      });

      this.capabilities.set(serverId, initResponse.capabilities || {});

      // Send initialized notification directly over transport
      await transport.send({
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      });

      if (initResponse.capabilities?.tools) {
        const toolsList = await pipeline.sendRequest('tools/list');
        this.tools.set(serverId, toolsList.tools || []);
      }
      if (initResponse.capabilities?.resources) {
        const resourcesList = await pipeline.sendRequest('resources/list');
        this.resources.set(serverId, resourcesList.resources || []);
      }
      if (initResponse.capabilities?.prompts) {
        const promptsList = await pipeline.sendRequest('prompts/list');
        this.prompts.set(serverId, promptsList.prompts || []);
      }

      const session: MCPSession = {
        sessionId: `sess-${Math.random().toString(36).substring(7)}`,
        serverId,
        status: 'CONNECTED',
        createdAt: new Date().toISOString()
      };

      this.sessions.set(serverId, session);

      traceEventBus.publish({
        traceId: `trace-mcp-${serverId}`,
        requestId: `req-mcp-${serverId}`,
        stage: 'mcp',
        component: 'MCPClientHub',
        status: 'completed',
        metadata: { serverId, sessionId: session.sessionId }
      });

      return session;
    } catch (err: any) {
      traceEventBus.publish({
        traceId: `trace-mcp-${serverId}`,
        requestId: `req-mcp-${serverId}`,
        stage: 'mcp',
        component: 'MCPClientHub',
        status: 'failed',
        metadata: { serverId, error: err.message }
      });
      await transport.disconnect().catch(() => {});
      throw err;
    }
  }

  public async disconnect(serverId: string): Promise<void> {
    const session = this.sessions.get(serverId);
    if (!session) return;

    this.sessions.delete(serverId);
    this.pipelines.delete(serverId);
    this.capabilities.delete(serverId);
    this.tools.delete(serverId);
    this.resources.delete(serverId);
    this.prompts.delete(serverId);

    const transport = this.transports.get(serverId);
    if (transport) {
      this.transports.delete(serverId);
      await transport.disconnect().catch(() => {});
    }
  }

  public getSession(serverId: string): MCPSession | null {
    return this.sessions.get(serverId) || null;
  }

  public getTools(serverId: string): MCPTool[] {
    return this.tools.get(serverId) || [];
  }

  public getResources(serverId: string): MCPResource[] {
    return this.resources.get(serverId) || [];
  }

  public getPrompts(serverId: string): MCPPrompt[] {
    return this.prompts.get(serverId) || [];
  }

  public async invokeTool(
    serverId: string,
    toolName: string,
    args: any,
    context: { tenantId: string; workspaceId: string; creatorId: string; traceId?: string }
  ): Promise<any> {
    const pipeline = this.pipelines.get(serverId);
    if (!pipeline) {
      throw new Error(`No active session for server "${serverId}".`);
    }

    const policyReport = await policyRuntime.evaluate('PRE_TOOL', args, {
      traceId: context.traceId || `trace-mcp-invoke-${serverId}`,
      creatorId: context.creatorId,
      metadata: {
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        serverId,
        toolName
      }
    });

    if (!policyReport.passed) {
      throw new Error(`Policy Denied: Tool call "${toolName}" was blocked by policy rules.`);
    }

    const cleanArgs = this.scrubSecrets(args);

    traceEventBus.publish({
      traceId: context.traceId || `trace-mcp-invoke-${serverId}`,
      requestId: `req-mcp-invoke-${serverId}`,
      stage: 'mcp',
      component: 'MCPClientHub',
      status: 'started',
      metadata: { serverId, toolName, arguments: cleanArgs }
    });

    const startTime = Date.now();

    try {
      const response = await pipeline.sendRequest('tools/call', {
        name: toolName,
        arguments: args
      });

      const postReport = await policyRuntime.evaluate('POST_TOOL', response, {
        traceId: context.traceId || `trace-mcp-invoke-${serverId}`,
        creatorId: context.creatorId,
        metadata: {
          tenantId: context.tenantId,
          workspaceId: context.workspaceId,
          serverId,
          toolName
        }
      });

      if (!postReport.passed) {
        throw new Error(`Policy Denied: Tool execution output was blocked by security policies.`);
      }

      traceEventBus.publish({
        traceId: context.traceId || `trace-mcp-invoke-${serverId}`,
        requestId: `req-mcp-invoke-${serverId}`,
        stage: 'mcp',
        component: 'MCPClientHub',
        status: 'completed',
        metadata: { 
          serverId, 
          toolName, 
          latencyMs: Date.now() - startTime
        }
      });

      return response;
    } catch (err: any) {
      traceEventBus.publish({
        traceId: context.traceId || `trace-mcp-invoke-${serverId}`,
        requestId: `req-mcp-invoke-${serverId}`,
        stage: 'mcp',
        component: 'MCPClientHub',
        status: 'failed',
        metadata: { serverId, toolName, error: err.message, latencyMs: Date.now() - startTime }
      });
      throw err;
    }
  }

  public async dispose(): Promise<void> {
    const servers = Array.from(this.sessions.keys());
    for (const serverId of servers) {
      await this.disconnect(serverId).catch(() => {});
    }
  }

  private scrubSecrets(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    const result = Array.isArray(obj) ? [] : {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('secret') ||
        lowerKey.includes('key') ||
        lowerKey.includes('token') ||
        lowerKey.includes('password') ||
        lowerKey.includes('auth')
      ) {
        (result as any)[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        (result as any)[key] = this.scrubSecrets(value);
      } else {
        (result as any)[key] = value;
      }
    }
    return result;
  }
}
