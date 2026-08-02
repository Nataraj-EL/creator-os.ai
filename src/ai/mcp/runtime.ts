import { 
  MCPServer, 
  MCPSession, 
  MCPTool, 
  MCPResource, 
  MCPPrompt, 
  MCPTransport, 
  ResourceCache, 
  MCPDiscoveryProvider, 
  MCPLifecycleEvent, 
  MCPLifecycleEventType, 
  MCPLifecycleListener 
} from './types';
import { MCPRegistry } from './registry';
import { SessionManager } from './session';
import { RequestPipeline } from './pipeline';
import { featureFlags } from './config/featureFlags';

export class MCPRuntime {
  private listeners: Set<MCPLifecycleListener> = new Set();
  private pipelines: Map<string, RequestPipeline> = new Map();

  constructor(
    private registry: MCPRegistry,
    private sessionManager: SessionManager,
    private cache: ResourceCache,
    private discoveryProvider: MCPDiscoveryProvider
  ) {}

  public addListener(listener: MCPLifecycleListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: MCPLifecycleListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(
    type: MCPLifecycleEventType,
    serverId?: string,
    sessionId?: string,
    details?: Record<string, any>
  ): void {
    const event: MCPLifecycleEvent = {
      type,
      timestamp: new Date().toISOString(),
      serverId,
      sessionId,
      details
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[MCPRuntime] Listener failed:", err);
      }
    }
  }

  public async connect(serverId: string, transport: MCPTransport): Promise<MCPSession> {
    const server = this.registry.resolve(serverId);
    const session = await this.sessionManager.createSession(serverId, transport, server.capabilities);

    const pipeline = new RequestPipeline(transport);
    this.pipelines.set(serverId, pipeline);

    this.emitEvent('SERVER_CONNECTED', serverId, session.sessionId);
    return session;
  }

  public async disconnect(serverId: string): Promise<void> {
    const session = this.sessionManager.getSession(serverId);
    const sessionId = session?.sessionId;

    await this.sessionManager.closeSession(serverId);
    this.pipelines.delete(serverId);

    this.emitEvent('SERVER_DISCONNECTED', serverId, sessionId);
  }

  private getPipeline(serverId: string): RequestPipeline {
    const pipeline = this.pipelines.get(serverId);
    if (!pipeline) {
      throw new Error(`No active request pipeline for server "${serverId}". Call connect() first.`);
    }
    return pipeline;
  }

  public async discoverTools(serverId: string): Promise<MCPTool[]> {
    const pipeline = this.getPipeline(serverId);
    const result = await pipeline.sendRequest('tools/list');
    return result.tools || [];
  }

  public async discoverResources(serverId: string): Promise<MCPResource[]> {
    const pipeline = this.getPipeline(serverId);
    const result = await pipeline.sendRequest('resources/list');
    return result.resources || [];
  }

  public async discoverPrompts(serverId: string): Promise<MCPPrompt[]> {
    const pipeline = this.getPipeline(serverId);
    const result = await pipeline.sendRequest('prompts/list');
    return result.prompts || [];
  }

  public async invokeTool(serverId: string, toolName: string, args: any): Promise<any> {
    const pipeline = this.getPipeline(serverId);
    this.emitEvent('TOOL_INVOKED', serverId, undefined, { toolName, args });
    const result = await pipeline.sendRequest('tools/call', { name: toolName, arguments: args });
    return result;
  }

  public async readResource(serverId: string, resourceUri: string): Promise<string> {
    if (featureFlags.MCP_CACHING) {
      const cached = await this.cache.get(resourceUri);
      if (cached !== null) {
        return cached;
      }
    }

    const pipeline = this.getPipeline(serverId);
    this.emitEvent('RESOURCE_READ', serverId, undefined, { resourceUri });
    const result = await pipeline.sendRequest('resources/read', { uri: resourceUri });
    const content = result.contents?.[0]?.text || '';

    if (featureFlags.MCP_CACHING) {
      await this.cache.set(resourceUri, content);
    }

    return content;
  }
}
