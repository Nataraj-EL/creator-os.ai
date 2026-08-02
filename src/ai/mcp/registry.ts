import { MCPServer } from './types';

export class MCPRegistry {
  private servers: Map<string, MCPServer> = new Map();

  public register(server: MCPServer): void {
    if (this.servers.has(server.id)) {
      throw new Error(`MCP Server with ID "${server.id}" is already registered.`);
    }
    this.servers.set(server.id, { ...server });
  }

  public unregister(id: string): void {
    this.servers.delete(id);
  }

  public resolve(id: string): MCPServer {
    const server = this.servers.get(id);
    if (!server) {
      throw new Error(`MCP Server with ID "${id}" not found in registry.`);
    }
    return { ...server };
  }

  public getServers(): MCPServer[] {
    return Array.from(this.servers.values()).map(s => ({ ...s }));
  }

  public clear(): void {
    this.servers.clear();
  }
}

export class MCPCapabilityRegistry {
  // Maps serverId to its capabilities list
  private activeCapabilities: Map<string, Record<string, boolean>> = new Map();

  public registerCapabilities(serverId: string, capabilities: Record<string, boolean>): void {
    this.activeCapabilities.set(serverId, { ...capabilities });
  }

  public hasCapability(serverId: string, capability: string): boolean {
    const caps = this.activeCapabilities.get(serverId);
    return !!(caps && caps[capability]);
  }

  public getCapabilities(serverId: string): Record<string, boolean> | null {
    const caps = this.activeCapabilities.get(serverId);
    return caps ? { ...caps } : null;
  }

  public clearCapabilities(serverId: string): void {
    this.activeCapabilities.delete(serverId);
  }
}
