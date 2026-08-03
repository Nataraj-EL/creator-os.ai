export interface TenantFeatureFlags {
  MULTI_TENANT: boolean;
  RBAC_RUNTIME: boolean;
}

export const featureFlags: TenantFeatureFlags = {
  MULTI_TENANT: false,
  RBAC_RUNTIME: false,
};
