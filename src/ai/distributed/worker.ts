import { 
  Job, 
  JobResult, 
  QueueAdapter, 
  WorkerInfo, 
  DistributedEvent, 
  DistributedEventType, 
  DistributedListener, 
  RetryStrategy 
} from './types';
import { featureFlags } from './config/featureFlags';

export class WorkerRuntime {
  private status: 'ACTIVE' | 'IDLE' | 'STOPPED' = 'STOPPED';
  private activeJobs: Map<string, { job: Job; heartbeatTimer: NodeJS.Timeout }> = new Map();
  private listeners: Set<DistributedListener> = new Set();
  private pollInterval: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    public readonly workerId: string,
    private queue: QueueAdapter,
    private concurrencyLimit: number,
    private executors: Record<Job['type'], (payload: any) => Promise<any>>,
    private allowedScope?: { tenantId: string; workspaceId: string }
  ) {}

  public addListener(listener: DistributedListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: DistributedListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(
    type: DistributedEventType,
    jobId?: string,
    details?: Record<string, any>
  ): void {
    const event: DistributedEvent = {
      type,
      timestamp: new Date().toISOString(),
      jobId,
      workerId: this.workerId,
      details
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[WorkerRuntime] Listener failed:", err);
      }
    }
  }

  public getInfo(): WorkerInfo {
    return {
      id: this.workerId,
      status: this.status,
      currentJobs: Array.from(this.activeJobs.keys()),
      lastHeartbeat: new Date().toISOString()
    };
  }

  public start(): void {
    if (!featureFlags.DISTRIBUTED_RUNTIME && !featureFlags.WORKER_POOL) return;
    if (this.status !== 'STOPPED') return;

    this.status = 'IDLE';
    this.emitEvent('WORKER_STARTED');

    this.poll();
    this.pollInterval = setInterval(() => this.poll(), 100);
  }

  public async stop(gracePeriodMs = 1000): Promise<void> {
    this.status = 'STOPPED';
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    const startShutdown = Date.now();
    while (this.activeJobs.size > 0 && (Date.now() - startShutdown) < gracePeriodMs) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    for (const jobId of this.activeJobs.keys()) {
      const active = this.activeJobs.get(jobId);
      if (active) {
        clearInterval(active.heartbeatTimer);
        try {
          await this.queue.release(jobId);
        } catch (err) {
          console.error(`[Worker:${this.workerId}] Release failed during force shutdown:`, err);
        }
      }
    }
    this.activeJobs.clear();
    this.emitEvent('WORKER_STOPPED');
  }

  private async poll(): Promise<void> {
    if (this.status === 'STOPPED' || this.isPolling) return;
    if (this.activeJobs.size >= this.concurrencyLimit) return;

    this.isPolling = true;
    try {
      const job = await this.queue.dequeue(this.workerId);
      if (job) {
        if (this.allowedScope) {
          const tenantId = job.metadata.tenantId || 'default';
          const workspaceId = job.metadata.workspaceId || 'default';
          if (tenantId !== this.allowedScope.tenantId || workspaceId !== this.allowedScope.workspaceId) {
            // Out of scope: Dead-letter the job immediately to avoid infinite loops
            await this.queue.deadLetter(job.id, `Job tenant/workspace context (${tenantId}/${workspaceId}) is outside worker allowed scope (${this.allowedScope.tenantId}/${this.allowedScope.workspaceId}).`);
            return;
          }
        }
        this.status = 'ACTIVE';
        await this.executeJob(job);
      }
    } catch (err) {
      console.error(`[Worker:${this.workerId}] Queue dequeue loop error:`, err);
    } finally {
      this.isPolling = false;
      this.updateIdleState();
    }
  }

  private updateIdleState(): void {
    if (this.status !== 'STOPPED') {
      this.status = this.activeJobs.size === 0 ? 'IDLE' : 'ACTIVE';
    }
  }

  private async executeJob(job: Job): Promise<void> {
    const startTime = Date.now();
    job.status = 'RUNNING';

    const intervalMs = job.policy.timeoutMs ? Math.min(2000, job.policy.timeoutMs / 2) : 1000;
    const heartbeatTimer = setInterval(async () => {
      try {
        await this.queue.heartbeat(job.id);
        this.emitEvent('HEARTBEAT_RECEIVED', job.id);
      } catch (err) {
        console.error(`[Worker:${this.workerId}] Heartbeat update failed:`, err);
      }
    }, intervalMs);

    this.activeJobs.set(job.id, { job, heartbeatTimer });
    this.emitEvent('JOB_STARTED', job.id);

    try {
      const executor = this.executors[job.type];
      if (!executor) {
        throw new Error(`No executor registered for job type "${job.type}".`);
      }

      const executionPromise = executor(job.payload);
      
      let output: any;
      if (job.policy.timeoutMs) {
        output = await Promise.race([
          executionPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Job execution timeout.')), job.policy.timeoutMs))
        ]);
      } else {
        output = await executionPromise;
      }

      const durationMs = Date.now() - startTime;
      clearInterval(heartbeatTimer);

      const result: JobResult = {
        jobId: job.id,
        status: 'COMPLETED',
        output,
        durationMs
      };

      await this.queue.acknowledge(job.id, result);
      this.activeJobs.delete(job.id);
      this.emitEvent('JOB_COMPLETED', job.id, { durationMs });

    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      clearInterval(heartbeatTimer);

      const maxRetries = job.policy.maxRetries ?? 0;
      const attempts = job.metadata.attempts;

      if (featureFlags.JOB_RETRIES && attempts < maxRetries) {
        const baseBackoff = job.policy.backoffMs ?? 100;
        const strategy = job.policy.retryStrategy ?? 'fixed';
        const backoffMs = this.calculateBackoff(strategy, attempts + 1, baseBackoff);

        await this.queue.retry(job.id, err.message, backoffMs);
        this.activeJobs.delete(job.id);
        this.emitEvent('JOB_RETRIED', job.id, { error: err.message, attempt: attempts + 1, backoffMs });
      } else {
        await this.queue.deadLetter(job.id, err.message);
        this.activeJobs.delete(job.id);
        this.emitEvent('JOB_FAILED', job.id, { error: err.message });
      }
    }
  }

  private calculateBackoff(strategy: RetryStrategy, attempts: number, baseBackoffMs: number): number {
    if (strategy === 'linear') {
      return baseBackoffMs * attempts;
    }
    if (strategy === 'exponential') {
      return baseBackoffMs * Math.pow(2, attempts - 1);
    }
    return baseBackoffMs;
  }
}
