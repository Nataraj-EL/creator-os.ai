import { Queue as BullQueue } from 'bullmq';
import Redis from 'ioredis';
import { QueueAdapter, Job, JobResult, QueueMetrics, JobState } from '../types';
import { featureFlags } from '../config/featureFlags';
import { InMemoryQueueAdapter } from '../queue';

export class BullMQQueueAdapter implements QueueAdapter {
  private client?: Redis;
  private bullQueue?: BullQueue;
  private fallback?: InMemoryQueueAdapter;
  private isInitialized = false;
  private redisUrl: string;

  constructor(connectionString: string) {
    this.redisUrl = connectionString || process.env.REDIS_URL || '';
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      if (!this.redisUrl) {
        throw new Error("No Redis connection URL configured.");
      }
      
      // Initialize Redis Client and connection parameters dynamically
      this.client = new Redis(this.redisUrl, {
        maxRetriesPerRequest: null, // Required by BullMQ
        enableOfflineQueue: false,  // Do not queue commands while disconnected
        lazyConnect: true
      });

      await this.client.connect();
      await this.client.ping();
      
      this.bullQueue = new BullQueue('creator-os-jobs', {
        connection: this.client
      });
      
      this.isInitialized = true;
    } catch (err) {
      console.warn("[BullMQQueueAdapter] Redis connection failed during startup initialization. Falling back to InMemoryQueueAdapter:", err);
      this.fallback = new InMemoryQueueAdapter();
      this.isInitialized = true;
    }
  }

  private ensureConnected(): void {
    if (!this.isInitialized) {
      throw new Error("BullMQQueueAdapter not initialized. Call initialize() first.");
    }
  }

  public async enqueue(job: Job): Promise<void> {
    this.ensureConnected();
    if (this.fallback) {
      return this.fallback.enqueue(job);
    }

    if (!job.metadata.tenantId || job.metadata.tenantId === 'default' || !job.metadata.workspaceId || job.metadata.workspaceId === 'default') {
      throw new Error("Missing or unauthorized tenant/workspace context in job metadata.");
    }

    try {
      job.status = 'QUEUED';
      job.updatedAt = new Date().toISOString();

      if (this.client) {
        await this.client.hset('distributed:jobs', job.id, JSON.stringify(job));
        await this.client.zadd('distributed:queue:priority', job.metadata.priority, job.id);
      }

      if (this.bullQueue) {
        await this.bullQueue.add(job.type, { jobId: job.id }, {
          jobId: job.id,
          priority: job.metadata.priority
        });
      }
    } catch (err) {
      console.error(`[BullMQQueueAdapter] enqueue failed for job ${job.id}:`, err);
      throw err;
    }
  }

  public async reserve(jobId: string, workerId: string): Promise<void> {
    this.ensureConnected();
    if (this.fallback) {
      return this.fallback.reserve(jobId, workerId);
    }

    try {
      if (!this.client) throw new Error("Redis client not initialized.");
      const jobData = await this.client.hget('distributed:jobs', jobId);
      if (!jobData) throw new Error(`Job "${jobId}" not found.`);

      const job: Job = JSON.parse(jobData);
      if (job.status !== 'QUEUED') {
        throw new Error(`Job "${jobId}" cannot be reserved from state "${job.status}".`);
      }

      job.status = 'RESERVED';
      job.workerId = workerId;
      job.updatedAt = new Date().toISOString();

      await this.client.hset('distributed:jobs', jobId, JSON.stringify(job));
    } catch (err) {
      console.error(`[BullMQQueueAdapter] reserve failed for job ${jobId}:`, err);
      throw err;
    }
  }

  public async release(jobId: string): Promise<void> {
    this.ensureConnected();
    if (this.fallback) {
      return this.fallback.release(jobId);
    }

    try {
      if (!this.client) throw new Error("Redis client not initialized.");
      const jobData = await this.client.hget('distributed:jobs', jobId);
      if (!jobData) throw new Error(`Job "${jobId}" not found.`);

      const job: Job = JSON.parse(jobData);
      job.status = 'QUEUED';
      job.workerId = undefined;
      job.updatedAt = new Date().toISOString();

      await this.client.hset('distributed:jobs', jobId, JSON.stringify(job));
      await this.client.zadd('distributed:queue:priority', job.metadata.priority, jobId);
    } catch (err) {
      console.error(`[BullMQQueueAdapter] release failed for job ${jobId}:`, err);
      throw err;
    }
  }

  public async dequeue(workerId: string): Promise<Job | null> {
    this.ensureConnected();
    if (this.fallback) {
      return this.fallback.dequeue(workerId);
    }

    try {
      if (!this.client) throw new Error("Redis client not initialized.");
      const result = await this.client.zpopmax('distributed:queue:priority');
      if (!result || result.length === 0) return null;

      const jobId = result[0];
      const jobData = await this.client.hget('distributed:jobs', jobId);
      if (!jobData) return null;

      const job: Job = JSON.parse(jobData);
      
      job.status = 'RESERVED';
      job.workerId = workerId;
      job.updatedAt = new Date().toISOString();

      await this.client.hset('distributed:jobs', jobId, JSON.stringify(job));
      return job;
    } catch (err) {
      console.error(`[BullMQQueueAdapter] dequeue failed:`, err);
      throw err;
    }
  }

  public async acknowledge(jobId: string, result: JobResult): Promise<void> {
    this.ensureConnected();
    if (this.fallback) {
      return this.fallback.acknowledge(jobId, result);
    }

    try {
      if (!this.client) throw new Error("Redis client not initialized.");
      const jobData = await this.client.hget('distributed:jobs', jobId);
      if (!jobData) throw new Error(`Job "${jobId}" not found.`);

      const job: Job = JSON.parse(jobData);
      job.status = result.status;
      job.updatedAt = new Date().toISOString();

      await this.client.hset('distributed:jobs', jobId, JSON.stringify(job));

      if (result.status === 'COMPLETED') {
        await this.client.incr('distributed:metrics:completed');
      } else if (result.status === 'FAILED') {
        await this.client.incr('distributed:metrics:failed');
      }
    } catch (err) {
      console.error(`[BullMQQueueAdapter] acknowledge failed for job ${jobId}:`, err);
      throw err;
    }
  }

  public async retry(jobId: string, error: string, backoffMs: number): Promise<void> {
    this.ensureConnected();
    if (this.fallback) {
      return this.fallback.retry(jobId, error, backoffMs);
    }

    try {
      if (!this.client) throw new Error("Redis client not initialized.");
      const jobData = await this.client.hget('distributed:jobs', jobId);
      if (!jobData) throw new Error(`Job "${jobId}" not found.`);

      const job: Job = JSON.parse(jobData);
      job.status = 'RETRYING';
      job.metadata.attempts++;
      job.updatedAt = new Date().toISOString();

      await this.client.hset('distributed:jobs', jobId, JSON.stringify(job));
      await this.client.incr('distributed:metrics:retries');

      setTimeout(async () => {
        try {
          if (this.client) {
            const freshJobData = await this.client.hget('distributed:jobs', jobId);
            if (freshJobData) {
              const freshJob: Job = JSON.parse(freshJobData);
              if (freshJob.status === 'RETRYING') {
                freshJob.status = 'QUEUED';
                freshJob.updatedAt = new Date().toISOString();
                await this.client.hset('distributed:jobs', jobId, JSON.stringify(freshJob));
                await this.client.zadd('distributed:queue:priority', freshJob.metadata.priority, jobId);
              }
            }
          }
        } catch (retryErr) {
          console.error(`[BullMQQueueAdapter] Failed to resolve delay retry for job ${jobId}:`, retryErr);
        }
      }, backoffMs);

    } catch (err) {
      console.error(`[BullMQQueueAdapter] retry command failed for job ${jobId}:`, err);
      throw err;
    }
  }

  public async cancel(jobId: string): Promise<void> {
    this.ensureConnected();
    if (this.fallback) {
      return this.fallback.cancel(jobId);
    }

    try {
      if (!this.client) throw new Error("Redis client not initialized.");
      const jobData = await this.client.hget('distributed:jobs', jobId);
      if (!jobData) throw new Error(`Job "${jobId}" not found.`);

      const job: Job = JSON.parse(jobData);
      job.status = 'CANCELLED';
      job.updatedAt = new Date().toISOString();

      await this.client.hset('distributed:jobs', jobId, JSON.stringify(job));
      await this.client.zrem('distributed:queue:priority', jobId);
    } catch (err) {
      console.error(`[BullMQQueueAdapter] cancel failed for job ${jobId}:`, err);
      throw err;
    }
  }

  public async deadLetter(jobId: string, error: string): Promise<void> {
    this.ensureConnected();
    if (this.fallback) {
      return this.fallback.deadLetter(jobId, error);
    }

    try {
      if (!this.client) throw new Error("Redis client not initialized.");
      const jobData = await this.client.hget('distributed:jobs', jobId);
      if (!jobData) throw new Error(`Job "${jobId}" not found.`);

      const job: Job = JSON.parse(jobData);
      job.status = 'DEAD_LETTER';
      job.updatedAt = new Date().toISOString();

      await this.client.hset('distributed:jobs', jobId, JSON.stringify(job));
      await this.client.incr('distributed:metrics:failed');
    } catch (err) {
      console.error(`[BullMQQueueAdapter] deadLetter failed for job ${jobId}:`, err);
      throw err;
    }
  }

  public async heartbeat(jobId: string): Promise<void> {
    this.ensureConnected();
    if (this.fallback) {
      return this.fallback.heartbeat(jobId);
    }

    try {
      if (!this.client) throw new Error("Redis client not initialized.");
      const jobData = await this.client.hget('distributed:jobs', jobId);
      if (!jobData) throw new Error(`Job "${jobId}" not found.`);

      const job: Job = JSON.parse(jobData);
      job.updatedAt = new Date().toISOString();

      await this.client.hset('distributed:jobs', jobId, JSON.stringify(job));
    } catch (err) {
      console.error(`[BullMQQueueAdapter] heartbeat failed for job ${jobId}:`, err);
      throw err;
    }
  }

  public async getJob(jobId: string): Promise<Job | null> {
    this.ensureConnected();
    if (this.fallback) {
      return this.fallback.getJob(jobId);
    }

    try {
      if (!this.client) throw new Error("Redis client not initialized.");
      const jobData = await this.client.hget('distributed:jobs', jobId);
      return jobData ? JSON.parse(jobData) : null;
    } catch (err) {
      console.error(`[BullMQQueueAdapter] getJob failed for ${jobId}:`, err);
      throw err;
    }
  }

  public async getMetrics(): Promise<QueueMetrics> {
    this.ensureConnected();
    if (this.fallback) {
      return this.fallback.getMetrics();
    }

    try {
      if (!this.client) throw new Error("Redis client not initialized.");
      const allJobs = await this.client.hvals('distributed:jobs');
      
      let queueDepth = 0;
      let activeJobs = 0;

      for (const raw of allJobs) {
        const job: Job = JSON.parse(raw);
        if (job.status === 'QUEUED' || job.status === 'RETRYING') {
          queueDepth++;
        } else if (job.status === 'RESERVED' || job.status === 'RUNNING') {
          activeJobs++;
        }
      }

      const completed = Number(await this.client.get('distributed:metrics:completed') || 0);
      const failed = Number(await this.client.get('distributed:metrics:failed') || 0);
      const retries = Number(await this.client.get('distributed:metrics:retries') || 0);

      return {
        queueDepth,
        activeJobs,
        completed,
        failed,
        retries
      };
    } catch (err) {
      console.error(`[BullMQQueueAdapter] getMetrics failed:`, err);
      throw err;
    }
  }

  public async clear(): Promise<void> {
    this.ensureConnected();
    if (this.fallback) {
      return this.fallback.clear();
    }
    
    if (this.client) {
      await this.client.del('distributed:jobs');
      await this.client.del('distributed:queue:priority');
      await this.client.del('distributed:metrics:completed');
      await this.client.del('distributed:metrics:failed');
      await this.client.del('distributed:metrics:retries');
    }
  }

  public async dispose(): Promise<void> {
    if (this.bullQueue) {
      await this.bullQueue.close().catch(() => {});
    }
    if (this.client) {
      await this.client.quit().catch(() => {});
    }
  }
}
