import { 
  Plugin, 
  PluginContext, 
  PluginEvent, 
  PluginEventType, 
  PluginListener, 
  PluginState 
} from './types';
import { PluginRegistry } from './registry';
import { satisfies } from './semver';
import { featureFlags } from './config/featureFlags';

export class PluginRuntime {
  private listeners: Set<PluginListener> = new Set();
  private beforeHooks: Set<(pluginId: string, stage: string) => void> = new Set();
  private afterHooks: Set<(pluginId: string, stage: string, durationMs: number) => void> = new Set();

  private resolvedOrderCache: string[] | null = null;

  constructor(
    private registry: PluginRegistry,
    private registries: Record<string, any>,
    private services: Record<string, any>
  ) {}

  public addListener(listener: PluginListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: PluginListener): void {
    this.listeners.delete(listener);
  }

  public registerBeforeHook(hook: (pluginId: string, stage: string) => void): void {
    this.beforeHooks.add(hook);
  }

  public registerAfterHook(hook: (pluginId: string, stage: string, durationMs: number) => void): void {
    this.afterHooks.add(hook);
  }

  private emitEvent(
    type: PluginEventType,
    pluginId: string,
    durationMs?: number,
    details?: Record<string, any>
  ): void {
    const event: PluginEvent = {
      type,
      timestamp: new Date().toISOString(),
      pluginId,
      durationMs,
      details
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[PluginRuntime] Listener failed:", err);
      }
    }
  }

  private triggerBeforeHook(pluginId: string, stage: string): void {
    for (const hook of this.beforeHooks) {
      try {
        hook(pluginId, stage);
      } catch (err) {
        console.error("[PluginRuntime] Before hook failed:", err);
      }
    }
  }

  private triggerAfterHook(pluginId: string, stage: string, durationMs: number): void {
    for (const hook of this.afterHooks) {
      try {
        hook(pluginId, stage, durationMs);
      } catch (err) {
        console.error("[PluginRuntime] After hook failed:", err);
      }
    }
  }

  public invalidateCache(): void {
    this.resolvedOrderCache = null;
  }

  public resolveDependencyOrder(): string[] {
    if (this.resolvedOrderCache) {
      return [...this.resolvedOrderCache];
    }

    const plugins = this.registry.getPlugins();
    const adjList: Map<string, string[]> = new Map();
    const inDegree: Map<string, number> = new Map();

    for (const p of plugins) {
      adjList.set(p.manifest.id, []);
      inDegree.set(p.manifest.id, 0);
    }

    for (const p of plugins) {
      const deps = p.manifest.dependencies || {};
      for (const [depId, constraint] of Object.entries(deps)) {
        const depPlugin = this.registry.getPlugin(depId);
        if (!depPlugin) {
          throw new Error(`Missing dependency: Plugin "${p.manifest.id}" requires "${depId}".`);
        }

        if (!satisfies(depPlugin.manifest.version, constraint)) {
          throw new Error(`Version mismatch: Plugin "${p.manifest.id}" requires "${depId}" satisfying "${constraint}", but found version "${depPlugin.manifest.version}".`);
        }

        let edges = adjList.get(depId);
        if (!edges) {
          edges = [];
          adjList.set(depId, edges);
        }
        edges.push(p.manifest.id);

        inDegree.set(p.manifest.id, (inDegree.get(p.manifest.id) || 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      order.push(u);

      const neighbors = adjList.get(u) || [];
      for (const v of neighbors) {
        const deg = (inDegree.get(v) || 0) - 1;
        inDegree.set(v, deg);
        if (deg === 0) {
          queue.push(v);
        }
      }
    }

    if (order.length !== plugins.length) {
      throw new Error("Dependency resolution cycle detected in plugin load graph.");
    }

    this.resolvedOrderCache = [...order];
    return order;
  }

  public async loadPlugins(): Promise<void> {
    if (!featureFlags.PLUGIN_RUNTIME) return;

    let order: string[];
    try {
      order = this.resolveDependencyOrder();
    } catch (err: any) {
      console.error("[PluginRuntime] Dependency sorting failed:", err.message);
      return;
    }

    for (const pluginId of order) {
      const plugin = this.registry.getPlugin(pluginId);
      if (!plugin || plugin.status === 'ACTIVE') continue;

      const context: PluginContext = {
        logger: {
          info: (msg) => console.log(`[Plugin:${pluginId}] [INFO] ${msg}`),
          warn: (msg) => console.warn(`[Plugin:${pluginId}] [WARN] ${msg}`),
          error: (msg) => console.error(`[Plugin:${pluginId}] [ERROR] ${msg}`)
        },
        config: { ...(plugin.manifest.configDefaults || {}) },
        registries: this.registries,
        services: this.services
      };

      try {
        if (plugin.install) {
          const startTime = Date.now();
          this.triggerBeforeHook(pluginId, 'install');
          await plugin.install(context);
          const duration = Date.now() - startTime;
          this.triggerAfterHook(pluginId, 'install', duration);
        }
        plugin.status = 'INSTALLED';
        this.emitEvent('PLUGIN_INSTALLED', pluginId);

        if (plugin.initialize) {
          const startTime = Date.now();
          this.triggerBeforeHook(pluginId, 'initialize');
          await plugin.initialize(context);
          const duration = Date.now() - startTime;
          this.triggerAfterHook(pluginId, 'initialize', duration);
        }
        plugin.status = 'INITIALIZED';

        if (plugin.activate) {
          const startTime = Date.now();
          this.triggerBeforeHook(pluginId, 'activate');
          await plugin.activate(context);
          const duration = Date.now() - startTime;
          this.triggerAfterHook(pluginId, 'activate', duration);
        }
        plugin.status = 'ACTIVE';
        this.emitEvent('PLUGIN_ACTIVATED', pluginId);

      } catch (err: any) {
        plugin.status = 'ERROR';
        console.error(`[PluginRuntime] Fail-open: Loading plugin "${pluginId}" failed:`, err);
        this.emitEvent('PLUGIN_FAILED', pluginId, undefined, { error: err.message });
      }
    }
  }

  public async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.registry.getPlugin(pluginId);
    if (!plugin) return;

    const context: PluginContext = {
      logger: {
        info: (msg) => console.log(`[Plugin:${pluginId}] [INFO] ${msg}`),
        warn: (msg) => console.warn(`[Plugin:${pluginId}] [WARN] ${msg}`),
        error: (msg) => console.error(`[Plugin:${pluginId}] [ERROR] ${msg}`)
      },
      config: {},
      registries: this.registries,
      services: this.services
    };

    const startTime = Date.now();

    try {
      if (plugin.status === 'ACTIVE' && plugin.deactivate) {
        this.triggerBeforeHook(pluginId, 'deactivate');
        await plugin.deactivate(context);
        const duration = Date.now() - startTime;
        this.triggerAfterHook(pluginId, 'deactivate', duration);
        plugin.status = 'INACTIVE';
        this.emitEvent('PLUGIN_DEACTIVATED', pluginId, duration);
      }

      if (plugin.uninstall) {
        this.triggerBeforeHook(pluginId, 'uninstall');
        await plugin.uninstall(context);
        const duration = Date.now() - startTime;
        this.triggerAfterHook(pluginId, 'uninstall', duration);
      }

      plugin.status = 'UNINSTALLED';
      this.registry.unregister(pluginId);
      this.invalidateCache();
    } catch (err: any) {
      plugin.status = 'ERROR';
      console.error(`[PluginRuntime] Unloading plugin "${pluginId}" failed:`, err);
      this.emitEvent('PLUGIN_FAILED', pluginId, undefined, { error: err.message });
    }
  }
}
