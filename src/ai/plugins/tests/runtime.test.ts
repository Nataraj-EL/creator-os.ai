import test from 'node:test';
import assert from 'node:assert';
import { 
  Plugin, 
  PluginRegistry, 
  PluginRuntime, 
  featureFlags 
} from '../index';
import { ToolRegistry, Tool } from '../../tools';
import { PolicyRegistry, Policy } from '../../policy';

test('Plugin SDK Test Suite', async (t) => {

  const registry = new PluginRegistry();
  const toolRegistry = new ToolRegistry();
  const policyRegistry = new PolicyRegistry();

  const registries = {
    toolRegistry,
    policyRegistry
  };

  const runtime = new PluginRuntime(registry, registries, {});

  await t.test('1. PluginRegistry double-registration checks', () => {
    registry.clear();

    const manifest = {
      id: 'plugin-1',
      name: 'Plugin 1',
      version: '1.0.0',
      author: 'Author',
      capabilities: {}
    };
    const plugin: Plugin = { manifest, status: 'INSTALLED' };

    registry.register(plugin);
    assert.throws(() => {
      registry.register(plugin);
    }, /already registered/);
  });

  await t.test('2. Semver constraint validation & dependency resolution order', () => {
    registry.clear();
    runtime.invalidateCache();

    const pluginA: Plugin = {
      manifest: {
        id: 'plugin-a',
        name: 'Plugin A',
        version: '1.6.2',
        author: 'Author',
        capabilities: {}
      },
      status: 'INSTALLED'
    };

    const pluginB: Plugin = {
      manifest: {
        id: 'plugin-b',
        name: 'Plugin B',
        version: '1.0.0',
        author: 'Author',
        dependencies: { 'plugin-a': '>=1.5.0' },
        capabilities: {}
      },
      status: 'INSTALLED'
    };

    registry.register(pluginA);
    registry.register(pluginB);

    const order = runtime.resolveDependencyOrder();
    assert.strictEqual(order.length, 2);
    assert.strictEqual(order[0], 'plugin-a');
    assert.strictEqual(order[1], 'plugin-b');

    pluginB.manifest.dependencies!['plugin-a'] = '>=2.0.0';
    runtime.invalidateCache();
    assert.throws(() => {
      runtime.resolveDependencyOrder();
    }, /Version mismatch/);
  });

  await t.test('3. Lifecycle executions & before/after hooks duration', async () => {
    featureFlags.PLUGIN_RUNTIME = true;
    registry.clear();
    runtime.invalidateCache();

    let installCalled = false;
    let activateCalled = false;

    const testPlugin: Plugin = {
      manifest: {
        id: 'plugin-test',
        name: 'Test Plugin',
        version: '1.0.0',
        author: 'Author',
        capabilities: {}
      },
      status: 'INSTALLED',
      install: () => { installCalled = true; },
      activate: () => { activateCalled = true; }
    };

    registry.register(testPlugin);

    let beforeCalled = false;
    let afterCalled = false;
    runtime.registerBeforeHook((id, stage) => {
      if (id === 'plugin-test' && stage === 'activate') {
        beforeCalled = true;
      }
    });
    runtime.registerAfterHook((id, stage, duration) => {
      if (id === 'plugin-test' && stage === 'activate') {
        afterCalled = true;
        assert.ok(duration >= 0);
      }
    });

    await runtime.loadPlugins();

    assert.strictEqual(testPlugin.status, 'ACTIVE');
    assert.strictEqual(installCalled, true);
    assert.strictEqual(activateCalled, true);
    assert.strictEqual(beforeCalled, true);
    assert.strictEqual(afterCalled, true);

    featureFlags.PLUGIN_RUNTIME = false;
  });

  await t.test('4. Clean unloads removing contributed resources', async () => {
    featureFlags.PLUGIN_RUNTIME = true;
    registry.clear();
    toolRegistry.clear();
    policyRegistry.clear();
    runtime.invalidateCache();

    const sampleTool: Tool = {
      name: 'contributed_tool',
      description: 'contributed',
      category: 'plugin',
      schema: { name: 'contributed_tool', description: 'contributed', parameters: { type: 'object', properties: {} } },
      execute: async () => ({})
    };

    const samplePolicy: Policy = {
      id: 'contributed_policy',
      version: '1.0.0',
      stage: 'PRE_PROVIDER',
      severity: 'LOW',
      priority: 1,
      enabled: true,
      evaluate: () => ({ decision: 'ALLOW', policyId: 'contributed_policy' })
    };

    const contributor: Plugin = {
      manifest: {
        id: 'contributor',
        name: 'Contributor Plugin',
        version: '1.0.0',
        author: 'Author',
        capabilities: { tools: true, policies: true }
      },
      status: 'INSTALLED',
      activate: (ctx) => {
        ctx.registries.toolRegistry.register(sampleTool);
        ctx.registries.policyRegistry.register(samplePolicy);
      },
      deactivate: (ctx) => {
        ctx.registries.toolRegistry.unregister('contributed_tool');
        ctx.registries.policyRegistry.unregister('contributed_policy');
      }
    };

    registry.register(contributor);
    await runtime.loadPlugins();

    assert.ok(toolRegistry.resolve('contributed_tool'));
    assert.ok(policyRegistry.resolve('contributed_policy'));

    await runtime.unloadPlugin('contributor');
    assert.strictEqual(contributor.status, 'UNINSTALLED');

    assert.throws(() => {
      toolRegistry.resolve('contributed_tool');
    }, /not registered/);
    assert.throws(() => {
      policyRegistry.resolve('contributed_policy');
    }, /not found/);

    featureFlags.PLUGIN_RUNTIME = false;
  });

  await t.test('5. Fail-open isolation on activation failures', async () => {
    featureFlags.PLUGIN_RUNTIME = true;
    registry.clear();
    runtime.invalidateCache();

    const buggy: Plugin = {
      manifest: {
        id: 'buggy',
        name: 'Buggy',
        version: '1.0.0',
        author: 'Author',
        capabilities: {}
      },
      status: 'INSTALLED',
      activate: () => {
        throw new Error('Buggy activation crashed!');
      }
    };

    const normal: Plugin = {
      manifest: {
        id: 'normal',
        name: 'Normal',
        version: '1.0.0',
        author: 'Author',
        capabilities: {}
      },
      status: 'INSTALLED'
    };

    registry.register(buggy);
    registry.register(normal);

    await runtime.loadPlugins();

    assert.strictEqual(buggy.status, 'ERROR');
    assert.strictEqual(normal.status, 'ACTIVE');

    featureFlags.PLUGIN_RUNTIME = false;
  });

  await t.test('6. Feature flags defaults', () => {
    assert.strictEqual(featureFlags.PLUGIN_RUNTIME, false);
    assert.strictEqual(featureFlags.PLUGIN_AUTOLOAD, false);
  });

});
