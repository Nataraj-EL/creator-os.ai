import { Organization, Workspace, Role, RoleAssignment, PermissionSet } from './types';

export class TenantRegistry {
  private organizations: Map<string, Organization> = new Map();
  private workspaces: Map<string, Workspace> = new Map();
  private assignments: Map<string, RoleAssignment[]> = new Map();
  private customRoles: Map<string, { role: Role; inherits: Role; permissions: PermissionSet }> = new Map();

  public createTenant(id: string, name: string): Organization {
    if (this.organizations.has(id)) {
      throw new Error(`Organization with ID "${id}" already exists.`);
    }
    const tenant: Organization = {
      id,
      name,
      createdAt: new Date().toISOString()
    };
    this.organizations.set(id, tenant);
    return tenant;
  }

  public createWorkspace(id: string, tenantId: string, name: string): Workspace {
    if (!this.organizations.has(tenantId)) {
      throw new Error(`Organization with ID "${tenantId}" does not exist.`);
    }
    if (this.workspaces.has(id)) {
      throw new Error(`Workspace with ID "${id}" already exists.`);
    }
    const ws: Workspace = {
      id,
      tenantId,
      name,
      createdAt: new Date().toISOString()
    };
    this.workspaces.set(id, ws);
    return ws;
  }

  public assignRole(tenantId: string, userId: string, role: Role, expiresAt?: string): void {
    if (!this.organizations.has(tenantId)) {
      throw new Error(`Organization with ID "${tenantId}" does not exist.`);
    }

    let list = this.assignments.get(tenantId);
    if (!list) {
      list = [];
      this.assignments.set(tenantId, list);
    }

    list = list.filter(a => !(a.userId === userId && a.role === role));
    list.push({ userId, tenantId, role, expiresAt });
    this.assignments.set(tenantId, list);
  }

  public getAssignments(tenantId: string): RoleAssignment[] {
    return this.assignments.get(tenantId) || [];
  }

  public registerCustomRole(role: Role, inherits: Role, permissions: PermissionSet): void {
    this.customRoles.set(role, { role, inherits, permissions });
  }

  public getCustomRole(role: Role): { role: Role; inherits: Role; permissions: PermissionSet } | null {
    return this.customRoles.get(role) || null;
  }

  public getWorkspace(id: string): Workspace | null {
    return this.workspaces.get(id) || null;
  }

  public clear(): void {
    this.organizations.clear();
    this.workspaces.clear();
    this.assignments.clear();
    this.customRoles.clear();
  }
}
