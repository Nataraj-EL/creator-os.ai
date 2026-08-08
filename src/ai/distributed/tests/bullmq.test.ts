import test from 'node:test';
import assert from 'node:assert';
import { featureFlags } from '../config/featureFlags';
import { BullMQQueueAdapter } from '../queue/bullmq';
import { Job, JobResult } from '../types';

class MockRedis {
  public data: Map<string, string> = new Map();
  public queue: Array<{ id: string; priority: number }> = [];
  public metrics: Record<string, number> = {};
  public isConnected = false;

  public async connect() {
    this.isConnected = true;
  }

  public async ping() {
    return 'PONG';
  }

  public async hset(key: string, field: string, val: string) {
    this.data.set(`${key}:${field}`, val);
  }

  public async hget(key: string, field: string) {
    return this.data.get(`${key}:${field}`) || null;
  }

  public async hvals(key: string) {
    const list: string[] = [];
    for (const [k, v] of this.data.entries()) {
      if (k.startsWith(`${key}:`)) {
        list.push(v);
      }
    }
    return list;
  }

  public async zadd(key: string, score: number, member: string) {
    this.queue = this.queue.filter(item => item.id !== member);
    this.queue.push({ id: member, priority: score });
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  public async zpopmax(key: string) {
    if (this.queue.length === 0) return [];
    const item = this.queue.shift()!;
    return [item.id, String(item.priority)];
  }

  public async zrem(key: string, member: string) {
    this.queue = this.queue.filter(item => item.id !== member);
  }

  public async del(key: string) {
    for (const k of Array.from(this.data.keys())) {
      if (k.startsWith(`${key}:`)) {
        this.data.delete(k);
      }
    }
    this.queue = [];
  }

  public async incr(key: string) {
    this.metrics[key] = (this.metrics[key] || 0) + 1;
    return this.metrics[key];
  }

  public async get(key: string) {
    return this.metrics[key] !== undefined ? String(this.metrics[key]) : null;
  }

  public async quit() {
    this.isConnected = false;
  }
}

test('Distributed Redis/BullMQ Queue Test Suite', async (t) => {

  const originalEnv = { ...process.env };

  const clearEnv = () => {
    delete process.env.REDIS_URL;
  };

  await t.test('1. Feature flag defaults', () => {
    assert.strictEqual(featureFlags.REDIS_QUEUE, false);
    assert.strictEqual(featureFlags.BULLMQ_WORKERS, false);
  });

  await t.test('2. Missing credentials / disabled fallback during startup', async () => {
    clearEnv();
    featureFlags.REDIS_QUEUE = false;

    const adapter = new BullMQQueueAdapter('');
    await adapter.initialize();

    // Verify fallback resolves to InMemoryQueueAdapter
    assert.ok((adapter as any).fallback);
  });

  await t.test('3. Enqueue and Dequeue mapping priority orders', async () => {
    const adapter = new BullMQQueueAdapter('mock://localhost');
    const mockRedis = new MockRedis();
    (adapter as any).client = mockRedis;
    (adapter as any).isInitialized = true;
    (adapter as any).bullQueue = { add: async () => {} };

    const jobLowPriority: Job = {
      id: 'job-low',
      type: 'AGENT',
      payload: { workspaceId: 'ws-1', tenantId: 't-1', text: 'low task' },
      status: 'QUEUED',
      metadata: { priority: 1, attempts: 0 },
      policy: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const jobHighPriority: Job = {
      id: 'job-high',
      type: 'AGENT',
      payload: { workspaceId: 'ws-1', tenantId: 't-1', text: 'high task' },
      status: 'QUEUED',
      metadata: { priority: 10, attempts: 0 },
      policy: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await adapter.enqueue(jobLowPriority);
    await adapter.enqueue(jobHighPriority);

    // Dequeue should yield the high priority task first
    const dequeued = await adapter.dequeue('worker-1');
    assert.ok(dequeued);
    assert.strictEqual(dequeued.id, 'job-high');
    assert.strictEqual(dequeued.status, 'RESERVED');
    assert.strictEqual(dequeued.workerId, 'worker-1');

    // Dequeue next
    const dequeuedNext = await adapter.dequeue('worker-1');
    assert.ok(dequeuedNext);
    assert.strictEqual(dequeuedNext.id, 'job-low');
  });

  await t.test('4. Job states lifecycle: acknowledge, cancel, retry backoffs, and DLQ', async () => {
    const adapter = new BullMQQueueAdapter('mock://localhost');
    const mockRedis = new MockRedis();
    (adapter as any).client = mockRedis;
    (adapter as any).isInitialized = true;

    const job: Job = {
      id: 'job-test',
      type: 'EVALUATION',
      payload: { workspaceId: 'ws-1', tenantId: 't-1' },
      status: 'QUEUED',
      metadata: { priority: 5, attempts: 0 },
      policy: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await adapter.enqueue(job);

    // 1. Dequeue/Reserve
    const grabbed = await adapter.dequeue('worker-2');
    assert.ok(grabbed);

    // 2. Acknowledge completed status
    await adapter.acknowledge('job-test', {
      jobId: 'job-test',
      status: 'COMPLETED',
      durationMs: 45
    });

    const completedJob = await adapter.getJob('job-test');
    assert.strictEqual(completedJob?.status, 'COMPLETED');
    
    const metrics = await adapter.getMetrics();
    assert.strictEqual(metrics.completed, 1);

    // 3. Retry and DLQ state mapping
    const failedJob: Job = {
      id: 'job-fail',
      type: 'WORKFLOW',
      payload: { workspaceId: 'ws-1' },
      status: 'QUEUED',
      metadata: { priority: 5, attempts: 0 },
      policy: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await adapter.enqueue(failedJob);
    await adapter.retry('job-fail', 'ExecutionTimeout', 10);

    const retriedJob = await adapter.getJob('job-fail');
    assert.strictEqual(retriedJob?.status, 'RETRYING');
    assert.strictEqual(retriedJob?.metadata.attempts, 1);

    // 4. Dead Letter routing
    await adapter.deadLetter('job-fail', 'Max attempts exceeded');
    const dlqJob = await adapter.getJob('job-fail');
    assert.strictEqual(dlqJob?.status, 'DEAD_LETTER');

    // 5. Job Cancellation
    const jobCancel: Job = {
      id: 'job-cancel',
      type: 'TOOL',
      payload: {},
      status: 'QUEUED',
      metadata: { priority: 5, attempts: 0 },
      policy: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await adapter.enqueue(jobCancel);
    await adapter.cancel('job-cancel');

    const cancelledJob = await adapter.getJob('job-cancel');
    assert.strictEqual(cancelledJob?.status, 'CANCELLED');
  });

  await t.test('5. Production crash connection error propagation', async () => {
    const adapter = new BullMQQueueAdapter('mock://localhost');
    const mockRedis = new MockRedis();
    (adapter as any).client = mockRedis;
    (adapter as any).isInitialized = true;

    // Simulate connection drops during active operations
    mockRedis.hset = async () => {
      throw new Error('Connection to Upstash Redis lost');
    };

    const job: Job = {
      id: 'job-prod',
      type: 'AGENT',
      payload: {},
      status: 'QUEUED',
      metadata: { priority: 5, attempts: 0 },
      policy: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Should NOT silently fallback, but propagate the error
    await assert.rejects(async () => {
      await adapter.enqueue(job);
    });
  });

  Object.assign(process.env, originalEnv);
});
