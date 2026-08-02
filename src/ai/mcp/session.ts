import { MCPSession, MCPTransport } from './types';
import { MCPCapabilityRegistry } from './registry';

export class SessionManager {
  private sessions: Map<string, MCPSession> = new Map();
  private transports: Map<string, MCPTransport> = new Map();
  private reconnectCounters: Map<string, number> = new Map();

  constructor(private capabilityRegistry: MCPCapabilityRegistry) {}

  public async createSession(
    serverId: string,
    transport: MCPTransport,
    capabilities: Record<string, boolean>
  ): Promise<MCPSession> {
    const sessionId = `sess-${serverId}-${Math.random().toString(36).substring(7)}`;

    await transport.connect();

    const session: MCPSession = {
      sessionId,
      serverId,
      status: 'CONNECTED',
      createdAt: new Date().toISOString()
    };

    this.sessions.set(serverId, session);
    this.transports.set(serverId, transport);
    this.capabilityRegistry.registerCapabilities(serverId, capabilities);
    this.reconnectCounters.set(serverId, 0);

    return session;
  }

  public getSession(serverId: string): MCPSession | null {
    return this.sessions.get(serverId) || null;
  }

  public getTransport(serverId: string): MCPTransport | null {
    return this.transports.get(serverId) || null;
  }

  public async closeSession(serverId: string): Promise<void> {
    const transport = this.transports.get(serverId);
    if (transport) {
      await transport.disconnect();
      this.transports.delete(serverId);
    }
    this.sessions.delete(serverId);
    this.capabilityRegistry.clearCapabilities(serverId);
    this.reconnectCounters.delete(serverId);
  }

  public async handleReconnect(serverId: string): Promise<MCPSession> {
    const session = this.getSession(serverId);
    if (!session) {
      throw new Error(`No active session to reconnect for server "${serverId}".`);
    }

    session.status = 'RECONNECTING';
    const counter = (this.reconnectCounters.get(serverId) || 0) + 1;
    this.reconnectCounters.set(serverId, counter);

    const transport = this.transports.get(serverId);
    if (transport) {
      await transport.connect();
      session.status = 'CONNECTED';
    } else {
      session.status = 'DISCONNECTED';
    }

    return session;
  }

  public getReconnectCount(serverId: string): number {
    return this.reconnectCounters.get(serverId) || 0;
  }

  public clear(): void {
    this.sessions.clear();
    this.transports.clear();
    this.reconnectCounters.clear();
  }
}
