import { QueueAdapter, Job, JobResult, QueueMetrics, JobState } from './types';

export class InMemoryQueueAdapter implements QueueAdapter {
  private jobs: Map<string, Job> = new Map();
  private completedCount = 0;
  private failedCount = 0;
  private retriesCount = 0;

  public async enqueue(job: Job): Promise<void> {
    job.status = 'QUEUED';
    job.updatedAt = new Date().toISOString();
    this.jobs.set(job.id, job);
  }

  public async reserve(jobId: string, workerId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job "${jobId}" not found.`);
    if (job.status !== 'QUEUED') {
      throw new Error(`Job "${jobId}" cannot be reserved from state "${job.status}".`);
    }
    job.status = 'RESERVED';
    job.workerId = workerId;
    job.updatedAt = new Date().toISOString();
  }

  public async release(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job "${jobId}" not found.`);
    job.status = 'QUEUED';
    job.workerId = undefined;
    job.updatedAt = new Date().toISOString();
  }

  public async dequeue(workerId: string): Promise<Job | null> {
    const queuedJobs = Array.from(this.jobs.values())
      .filter(j => j.status === 'QUEUED')
      .sort((a, b) => b.metadata.priority - a.metadata.priority);

    if (queuedJobs.length === 0) return null;

    const selected = queuedJobs[0];
    await this.reserve(selected.id, workerId);
    return selected;
  }

  public async acknowledge(jobId: string, result: JobResult): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job "${jobId}" not found.`);
    
    job.status = result.status;
    job.updatedAt = new Date().toISOString();

    if (result.status === 'COMPLETED') {
      this.completedCount++;
    } else if (result.status === 'FAILED') {
      this.failedCount++;
    }
  }

  public async retry(jobId: string, error: string, backoffMs: number): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job "${jobId}" not found.`);

    job.status = 'RETRYING';
    job.metadata.attempts++;
    job.updatedAt = new Date().toISOString();
    this.retriesCount++;

    setTimeout(() => {
      if (job.status === 'RETRYING') {
        job.status = 'QUEUED';
        job.updatedAt = new Date().toISOString();
      }
    }, backoffMs);
  }

  public async cancel(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job "${jobId}" not found.`);
    job.status = 'CANCELLED';
    job.updatedAt = new Date().toISOString();
  }

  public async deadLetter(jobId: string, error: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job "${jobId}" not found.`);
    job.status = 'DEAD_LETTER';
    job.updatedAt = new Date().toISOString();
    this.failedCount++;
  }

  public async heartbeat(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job "${jobId}" not found.`);
    job.updatedAt = new Date().toISOString();
  }

  public async getMetrics(): Promise<QueueMetrics> {
    let queueDepth = 0;
    let activeJobs = 0;

    for (const job of this.jobs.values()) {
      if (job.status === 'QUEUED' || job.status === 'RETRYING') {
        queueDepth++;
      } else if (job.status === 'RESERVED' || job.status === 'RUNNING') {
        activeJobs++;
      }
    }

    return {
      queueDepth,
      activeJobs,
      completed: this.completedCount,
      failed: this.failedCount,
      retries: this.retriesCount
    };
  }

  public async getJob(jobId: string): Promise<Job | null> {
    return this.jobs.get(jobId) || null;
  }

  public clear(): void {
    this.jobs.clear();
    this.completedCount = 0;
    this.failedCount = 0;
    this.retriesCount = 0;
  }
}
