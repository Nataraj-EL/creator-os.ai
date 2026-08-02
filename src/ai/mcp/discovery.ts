import { MCPDiscoveryProvider, MCPServer } from './types';
import { MCPRegistry } from './registry';

export class RegistryDiscoveryProvider implements MCPDiscoveryProvider {
  constructor(private registry: MCPRegistry) {}

  public async discoverServers(): Promise<MCPServer[]> {
    return this.registry.getServers();
  }
}
