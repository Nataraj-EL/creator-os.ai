import { 
  QueueAdapter, 
  Job, 
  JobMetadata, 
  ExecutionPolicy, 
  QueueMetrics, 
  DistributedEventType, 
  DistributedEvent, 
  DistributedListener 
} from './types';
import { featureFlags } from './config/featureFlags';

export class DistributedRuntime {
  private listeners: Set<DistributedListener> = new Set();

  constructor(private queue: QueueAdapter) {}

  public addListener(listener: DistributedListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: DistributedListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(type: DistributedEventType, jobId: string, details?: Record<string, any>): void {
    const event: DistributedEvent = {
      type,
      timestamp: new Date().toISOString(),
      jobId,
      details
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[DistributedRuntime] Listener failed:", err);
      }
    }
  }

  public async scheduleJob(
    type: Job['type'],
    payload: any,
    policy: ExecutionPolicy = {},
    priority = 0,
    metadata: Partial<JobMetadata> = {}
  ): Promise<Job> {
    if (!featureFlags.DISTRIBUTED_RUNTIME) {
      throw new Error("Distributed execution runtime is disabled.");
    }

    const jobId = `job-${Math.random().toString(36).substring(2, 11)}`;
    const job: Job = {
      id: jobId,
      type,
      payload,
      status: 'QUEUED',
      metadata: {
        traceId: metadata.traceId,
        workflowId: metadata.workflowId,
        agentId: metadata.agentId,
        creatorId: metadata.creatorId,
        priority,
        tags: metadata.tags || [],
        attempts: 0
      },
      policy: {
        timeoutMs: policy.timeoutMs ?? 5000,
        maxRetries: policy.maxRetries ?? 0,
        backoffMs: policy.backoffMs ?? 100,
        retryStrategy: policy.retryStrategy ?? 'fixed'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.queue.enqueue(job);
    this.emitEvent('JOB_QUEUED', job.id);
    return job;
  }

  public async getJobStatus(jobId: string): Promise<Job | null> {
    return this.queue.getJob(jobId);
  }

  public async getMetrics(): Promise<QueueMetrics> {
    return this.queue.getMetrics();
  }
}
