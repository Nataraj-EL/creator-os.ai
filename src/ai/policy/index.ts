import { PolicyRegistry } from './registry';
import { PolicyRuntime } from './runtime';

export * from './types';
export * from './registry';
export * from './runtime';
export * from './config/featureFlags';

export const policyRegistry = new PolicyRegistry();
export const policyRuntime = new PolicyRuntime(policyRegistry);
