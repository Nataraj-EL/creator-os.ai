export interface DistributedFeatureFlags {
  DISTRIBUTED_RUNTIME: boolean;
  WORKER_POOL: boolean;
  JOB_RETRIES: boolean;
  REDIS_QUEUE: boolean;
  BULLMQ_WORKERS: boolean;
}

export const featureFlags: DistributedFeatureFlags = {
  DISTRIBUTED_RUNTIME: false,
  WORKER_POOL: false,
  JOB_RETRIES: false,
  REDIS_QUEUE: false,
  BULLMQ_WORKERS: false,
};
