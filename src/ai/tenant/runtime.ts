import { 
  TenantContext, 
  Role, 
  PermissionSet, 
  ResourceScope, 
  TenantEvent, 
  TenantEventType, 
  TenantListener 
} from './types';
import { TenantRegistry } from './registry';
import { featureFlags } from './config/featureFlags';

const ROLE_HIERARCHY: Record<string, number> = {
  OWNER: 5,
  ADMIN: 4,
  DEVELOPER: 3,
  REVIEWER: 2,
  VIEWER: 1
};

const BUILT_IN_PERMISSIONS: Record<string, PermissionSet> = {
  OWNER: { allow: ['*'], deny: [] },
  ADMIN: {
    allow: [
      'tenant:*', 'workspace:*', 'memory:*', 'workflow:*',
      'agent:*', 'tool:*', 'plugin:*', 'mcp:*', 'graph:*', 'job:*'
    ],
    deny: []
  },
  DEVELOPER: {
    allow: [
      'workspace:read', 'memory:*', 'workflow:*',
      'agent:*', 'tool:*', 'job:*'
    ],
    deny: []
  },
  REVIEWER: {
    allow: [
      'workspace:read', 'memory:read', 'workflow:read',
      'agent:read', 'tool:read', 'eval:*'
    ],
    deny: []
  },
  VIEWER: {
    allow: [
      'workspace:read', 'memory:read', 'workflow:read',
      'agent:read', 'tool:read'
    ],
    deny: []
  }
};

function matchesWildcard(rule: string, permission: string): boolean {
  if (rule === '*') return true;
  if (rule === permission) return true;
  if (rule.endsWith(':*')) {
    const prefix = rule.slice(0, -2);
    return permission.startsWith(prefix + ':');
  }
  return false;
}

export class TenantRuntime {
  private listeners: Set<TenantListener> = new Set();
  private contextCache: Map<string, { context: TenantContext; timestamp: number }> = new Map();
  private evaluationCache: Map<string, boolean> = new Map();

  constructor(private registry: TenantRegistry) {}

  public addListener(listener: TenantListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: TenantListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(
    type: TenantEventType,
    tenantId?: string,
    workspaceId?: string,
    userId?: string,
    details?: Record<string, any>
  ): void {
    const event: TenantEvent = {
      type,
      timestamp: new Date().toISOString(),
      tenantId,
      workspaceId,
      userId,
      details
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[TenantRuntime] Listener failed:", err);
      }
    }
  }

  public invalidateCache(userId?: string): void {
    if (userId) {
      for (const [key] of this.contextCache.entries()) {
        if (key.endsWith(`:${userId}`)) {
          this.contextCache.delete(key);
        }
      }
      for (const [key] of this.evaluationCache.entries()) {
        if (key.startsWith(`${userId}:`)) {
          this.evaluationCache.delete(key);
        }
      }
    } else {
      this.contextCache.clear();
      this.evaluationCache.clear();
    }
  }

  public async resolveContext(tenantId: string, workspaceId: string, userId: string): Promise<TenantContext> {
    const cacheKey = `${tenantId}:${workspaceId}:${userId}`;
    const cached = this.contextCache.get(cacheKey);
    if (cached) {
      return cached.context;
    }

    const assignments = this.registry.getAssignments(tenantId);
    const activeAssignments = assignments.filter(a => {
      if (a.userId !== userId) return false;
      if (a.expiresAt && Date.now() > Date.parse(a.expiresAt)) return false;
      return true;
    });

    let resolvedRole: Role = 'VIEWER';
    if (activeAssignments.length > 0) {
      activeAssignments.sort((a, b) => {
        const priorityA = ROLE_HIERARCHY[a.role] ?? 0;
        const priorityB = ROLE_HIERARCHY[b.role] ?? 0;
        return priorityB - priorityA;
      });
      resolvedRole = activeAssignments[0].role;
    }

    const permissions = this.getPermissionsForRole(resolvedRole);

    const context: TenantContext = {
      tenantId,
      workspaceId,
      userId,
      role: resolvedRole,
      permissions
    };

    this.contextCache.set(cacheKey, { context, timestamp: Date.now() });
    this.emitEvent('AUDIT_LOG', tenantId, workspaceId, userId, { action: 'resolveContext', role: resolvedRole });

    return context;
  }

  private getPermissionsForRole(role: Role): PermissionSet {
    const allow: string[] = [];
    const deny: string[] = [];

    const addBuiltIn = (r: string) => {
      const builtIn = BUILT_IN_PERMISSIONS[r];
      if (builtIn) {
        allow.push(...builtIn.allow);
        deny.push(...builtIn.deny);
      }
    };

    const visited = new Set<string>();
    let currentRole: string | null = role;

    while (currentRole && !visited.has(currentRole)) {
      visited.add(currentRole);
      if (BUILT_IN_PERMISSIONS[currentRole]) {
        addBuiltIn(currentRole);
        const hierarchyVal = ROLE_HIERARCHY[currentRole] ?? 1;
        for (const [rName, val] of Object.entries(ROLE_HIERARCHY)) {
          if (val < hierarchyVal) {
            const lowerPerms = BUILT_IN_PERMISSIONS[rName];
            if (lowerPerms) {
              allow.push(...lowerPerms.allow);
              deny.push(...lowerPerms.deny);
            }
          }
        }
        break;
      } else {
        const custom = this.registry.getCustomRole(currentRole);
        if (custom) {
          allow.push(...custom.permissions.allow);
          deny.push(...custom.permissions.deny);
          currentRole = custom.inherits;
        } else {
          addBuiltIn('VIEWER');
          break;
        }
      }
    }

    return {
      allow: Array.from(new Set(allow)),
      deny: Array.from(new Set(deny))
    };
  }

  public checkPermission(context: TenantContext, permission: string, scope?: ResourceScope): boolean {
    if (!featureFlags.RBAC_RUNTIME) return true;

    const cacheKey = `${context.userId}:${context.role}:${permission}:${scope}`;
    if (this.evaluationCache.has(cacheKey)) {
      return this.evaluationCache.get(cacheKey)!;
    }

    const { allow, deny } = context.permissions;

    for (const denyRule of deny) {
      if (matchesWildcard(denyRule, permission)) {
        this.evaluationCache.set(cacheKey, false);
        this.emitEvent('PERMISSION_DENIED', context.tenantId, context.workspaceId, context.userId, { permission, scope, reason: 'Explicitly denied by permission set.' });
        return false;
      }
    }

    for (const allowRule of allow) {
      if (matchesWildcard(allowRule, permission)) {
        this.evaluationCache.set(cacheKey, true);
        this.emitEvent('AUDIT_LOG', context.tenantId, context.workspaceId, context.userId, { action: 'checkPermission', permission, scope, result: 'ALLOWED' });
        return true;
      }
    }

    this.evaluationCache.set(cacheKey, false);
    this.emitEvent('PERMISSION_DENIED', context.tenantId, context.workspaceId, context.userId, { permission, scope, reason: 'No matching allow rule found.' });
    return false;
  }

  public hasPermission(context: TenantContext, permission: string, scope?: ResourceScope): boolean {
    return this.checkPermission(context, permission, scope);
  }

  public hasRole(context: TenantContext, targetRole: Role): boolean {
    if (context.role === targetRole) return true;

    const contextPriority = ROLE_HIERARCHY[context.role] ?? 0;
    const targetPriority = ROLE_HIERARCHY[targetRole] ?? 0;

    const visited = new Set<string>();
    let currentRole: string | null = context.role;
    while (currentRole && !visited.has(currentRole)) {
      visited.add(currentRole);
      if (currentRole === targetRole) return true;
      const custom = this.registry.getCustomRole(currentRole);
      currentRole = custom ? custom.inherits : null;
    }

    return contextPriority >= targetPriority && targetPriority > 0;
  }

  public hasAnyRole(context: TenantContext, roles: Role[]): boolean {
    return roles.some(role => this.hasRole(context, role));
  }

  public resolveScope(
    resourceContext: { tenantId?: string; workspaceId?: string; userId?: string },
    context: TenantContext
  ): ResourceScope {
    if (resourceContext.userId && resourceContext.userId === context.userId) {
      return 'USER';
    }
    if (resourceContext.workspaceId && resourceContext.workspaceId === context.workspaceId) {
      return 'WORKSPACE';
    }
    if (resourceContext.tenantId && resourceContext.tenantId === context.tenantId) {
      return 'TENANT';
    }
    return 'GLOBAL';
  }
}
