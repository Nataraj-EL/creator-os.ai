import { Plugin, PluginManifest } from './types';

export class PluginRegistry {
  private plugins: Map<string, Plugin> = new Map();

  public register(plugin: Plugin): void {
    if (this.plugins.has(plugin.manifest.id)) {
      throw new Error(`Plugin with ID "${plugin.manifest.id}" is already registered.`);
    }
    this.plugins.set(plugin.manifest.id, plugin);
  }

  public unregister(id: string): void {
    const plugin = this.plugins.get(id);
    if (plugin) {
      plugin.status = 'UNINSTALLED';
      this.plugins.delete(id);
    }
  }

  public getPlugin(id: string): Plugin | null {
    return this.plugins.get(id) || null;
  }

  public getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  public getPluginsWithCapability(capability: keyof PluginManifest['capabilities']): Plugin[] {
    return this.getPlugins().filter(p => p.manifest.capabilities[capability]);
  }

  public enable(id: string): void {
    const plugin = this.plugins.get(id);
    if (plugin && plugin.status === 'INACTIVE') {
      plugin.status = 'ACTIVE';
    }
  }

  public disable(id: string): void {
    const plugin = this.plugins.get(id);
    if (plugin && plugin.status === 'ACTIVE') {
      plugin.status = 'INACTIVE';
    }
  }

  public clear(): void {
    this.plugins.clear();
  }
}
