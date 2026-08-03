export interface Organization {
  id: string;
  name: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  tenantId: string;
  name: string;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
}

export type Role = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'REVIEWER' | 'VIEWER' | string;

export interface PermissionSet {
  allow: string[];
  deny: string[];
}

export type ResourceScope = 'GLOBAL' | 'TENANT' | 'WORKSPACE' | 'USER';

export interface RoleAssignment {
  userId: string;
  tenantId: string;
  role: Role;
  expiresAt?: string; // Optional expiry timestamp
}

export interface TenantContext {
  tenantId: string;
  workspaceId: string;
  userId: string;
  role: Role;
  permissions: PermissionSet;
  metadata?: Record<string, any>;
}

export type TenantEventType = 
  | 'TENANT_CREATED' 
  | 'WORKSPACE_CREATED' 
  | 'ROLE_ASSIGNED' 
  | 'PERMISSION_DENIED'
  | 'AUDIT_LOG';

export interface TenantEvent {
  type: TenantEventType;
  timestamp: string;
  tenantId?: string;
  workspaceId?: string;
  userId?: string;
  details?: Record<string, any>;
}

export type TenantListener = (event: TenantEvent) => void;
