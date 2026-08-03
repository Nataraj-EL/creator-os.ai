export interface DistributedFeatureFlags {
  DISTRIBUTED_RUNTIME: boolean;
  WORKER_POOL: boolean;
  JOB_RETRIES: boolean;
}

export const featureFlags: DistributedFeatureFlags = {
  DISTRIBUTED_RUNTIME: false,
  WORKER_POOL: false,
  JOB_RETRIES: false,
};
