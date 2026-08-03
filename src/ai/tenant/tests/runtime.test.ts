import test from 'node:test';
import assert from 'node:assert';
import { 
  TenantRegistry, 
  TenantRuntime, 
  featureFlags 
} from '../index';

test('Multi-Tenant & RBAC Runtime Test Suite', async (t) => {

  const registry = new TenantRegistry();
  const runtime = new TenantRuntime(registry);

  await t.test('1. Organization and Workspace creation', () => {
    registry.clear();

    const tenant = registry.createTenant('tenant-1', 'Acme Corp');
    assert.strictEqual(tenant.id, 'tenant-1');
    assert.strictEqual(tenant.name, 'Acme Corp');

    const ws = registry.createWorkspace('workspace-1', 'tenant-1', 'Default Workspace');
    assert.strictEqual(ws.id, 'workspace-1');
    assert.strictEqual(ws.tenantId, 'tenant-1');

    assert.throws(() => {
      registry.createWorkspace('workspace-1', 'tenant-1', 'Duplicate Workspace');
    }, /already exists/);
  });

  await t.test('2. Role assignment with expiry and hierarchy priority', async () => {
    featureFlags.RBAC_RUNTIME = true;
    registry.clear();
    runtime.invalidateCache();

    registry.createTenant('t1', 'Tenant 1');
    
    // Assign ADMIN role
    registry.assignRole('t1', 'user-1', 'ADMIN');
    // Assign OWNER role (temporary, already expired)
    registry.assignRole('t1', 'user-1', 'OWNER', new Date(Date.now() - 10000).toISOString());

    const context = await runtime.resolveContext('t1', 'ws1', 'user-1');
    assert.strictEqual(context.role, 'ADMIN'); // Should ignore expired OWNER role
    assert.ok(runtime.hasRole(context, 'DEVELOPER')); // ADMIN inherits DEVELOPER perms

    featureFlags.RBAC_RUNTIME = false;
  });

  await t.test('3. Permission sets evaluation with deny overrides and wildcards', async () => {
    featureFlags.RBAC_RUNTIME = true;
    registry.clear();
    runtime.invalidateCache();

    registry.createTenant('t1', 'Tenant 1');

    // Register a custom role that overrides ADMIN permissions by denying workflow writes
    registry.registerCustomRole('CUSTOM_DEV', 'ADMIN', {
      allow: ['workflow:read'],
      deny: ['workflow:write']
    });

    registry.assignRole('t1', 'user-c', 'CUSTOM_DEV');

    const context = await runtime.resolveContext('t1', 'ws1', 'user-c');
    
    // Verify allow rules work
    assert.strictEqual(runtime.hasPermission(context, 'workflow:read'), true);
    // Verify explicit deny override overrides ADMIN's allow
    assert.strictEqual(runtime.hasPermission(context, 'workflow:write'), false);
    // Verify other ADMIN permissions still work
    assert.strictEqual(runtime.hasPermission(context, 'memory:write'), true);

    featureFlags.RBAC_RUNTIME = false;
  });

  await t.test('4. Helper APIs hasRole, hasAnyRole, and resolveScope', async () => {
    featureFlags.RBAC_RUNTIME = true;
    registry.clear();
    runtime.invalidateCache();

    registry.createTenant('t1', 'Tenant 1');
    registry.assignRole('t1', 'user-x', 'DEVELOPER');

    const context = await runtime.resolveContext('t1', 'ws1', 'user-x');
    assert.strictEqual(runtime.hasRole(context, 'DEVELOPER'), true);
    assert.strictEqual(runtime.hasRole(context, 'VIEWER'), true); // inherits VIEWER
    assert.strictEqual(runtime.hasRole(context, 'OWNER'), false);

    assert.strictEqual(runtime.hasAnyRole(context, ['OWNER', 'DEVELOPER']), true);

    const resourceScope = runtime.resolveScope({ tenantId: 't1', workspaceId: 'ws1' }, context);
    assert.strictEqual(resourceScope, 'WORKSPACE');

    const userScope = runtime.resolveScope({ userId: 'user-x' }, context);
    assert.strictEqual(userScope, 'USER');

    featureFlags.RBAC_RUNTIME = false;
  });

  await t.test('5. Context caching and invalidation checks', async () => {
    featureFlags.RBAC_RUNTIME = true;
    registry.clear();
    runtime.invalidateCache();

    registry.createTenant('t1', 'Tenant 1');
    registry.assignRole('t1', 'user-y', 'VIEWER');

    const context1 = await runtime.resolveContext('t1', 'ws1', 'user-y');
    assert.strictEqual(context1.role, 'VIEWER');

    // Update assignment in registry
    registry.assignRole('t1', 'user-y', 'ADMIN');
    
    // Should still resolve VIEWER due to caching
    const context2 = await runtime.resolveContext('t1', 'ws1', 'user-y');
    assert.strictEqual(context2.role, 'VIEWER');

    // Invalidate cache
    runtime.invalidateCache('user-y');

    // Should resolve ADMIN now
    const context3 = await runtime.resolveContext('t1', 'ws1', 'user-y');
    assert.strictEqual(context3.role, 'ADMIN');

    featureFlags.RBAC_RUNTIME = false;
  });

  await t.test('6. Audit logs and permission denied events', async () => {
    featureFlags.RBAC_RUNTIME = true;
    registry.clear();
    runtime.invalidateCache();

    registry.createTenant('t1', 'Tenant 1');
    registry.assignRole('t1', 'user-a', 'VIEWER');

    const context = await runtime.resolveContext('t1', 'ws1', 'user-a');

    let deniedCount = 0;
    let auditCount = 0;

    runtime.addListener((ev) => {
      if (ev.type === 'PERMISSION_DENIED') {
        deniedCount++;
      }
      if (ev.type === 'AUDIT_LOG') {
        auditCount++;
      }
    });

    // Check allowed permission
    const allowed = runtime.hasPermission(context, 'memory:read');
    assert.strictEqual(allowed, true);

    // Check denied permission
    const denied = runtime.hasPermission(context, 'memory:write');
    assert.strictEqual(denied, false);

    assert.strictEqual(deniedCount, 1);
    assert.ok(auditCount > 0);

    featureFlags.RBAC_RUNTIME = false;
  });

  await t.test('7. Feature flags defaults', () => {
    assert.strictEqual(featureFlags.MULTI_TENANT, false);
    assert.strictEqual(featureFlags.RBAC_RUNTIME, false);
  });

});
