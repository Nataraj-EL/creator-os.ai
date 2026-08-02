import { AgentRegistryEntry, AgentProfile } from './types';
import { AgentServices, AgentRuntime } from '../agent';

export class AgentRegistry {
  private entries: Map<string, AgentRegistryEntry> = new Map();

  public register(
    profile: AgentProfile,
    services: AgentServices,
    runtime: AgentRuntime
  ): void {
    if (this.entries.has(profile.id)) {
      throw new Error(`Agent with ID "${profile.id}" is already registered.`);
    }

    const entry: AgentRegistryEntry = {
      profile,
      services,
      runtime,
      enabled: true,
      version: profile.version || '1.0.0'
    };

    this.entries.set(profile.id, entry);
  }

  public unregister(agentId: string): void {
    this.entries.delete(agentId);
  }

  public resolve(agentId: string): AgentRegistryEntry {
    const entry = this.entries.get(agentId);
    if (!entry) {
      throw new Error(`Agent with ID "${agentId}" not found in registry.`);
    }
    return entry;
  }

  public enableAgent(agentId: string): void {
    const entry = this.resolve(agentId);
    entry.enabled = true;
  }

  public disableAgent(agentId: string): void {
    const entry = this.resolve(agentId);
    entry.enabled = false;
  }

  public getActiveAgents(): AgentRegistryEntry[] {
    return Array.from(this.entries.values()).filter(e => e.enabled);
  }

  public clear(): void {
    this.entries.clear();
  }
}
