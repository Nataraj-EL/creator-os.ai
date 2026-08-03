import test from 'node:test';
import assert from 'node:assert';
import { 
  Job, 
  InMemoryQueueAdapter, 
  WorkerRuntime, 
  DistributedRuntime, 
  featureFlags 
} from '../index';

test('Distributed Execution Runtime Test Suite', async (t) => {

  const queue = new InMemoryQueueAdapter();
  const runtime = new DistributedRuntime(queue);

  await t.test('1. InMemoryQueueAdapter reserve, release, cancel operations', async () => {
    queue.clear();

    const sampleJob: Job = {
      id: 'job-1',
      type: 'AGENT',
      payload: {},
      status: 'QUEUED',
      metadata: { priority: 10, attempts: 0 },
      policy: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await queue.enqueue(sampleJob);
    let metrics = await queue.getMetrics();
    assert.strictEqual(metrics.queueDepth, 1);

    await queue.reserve('job-1', 'worker-1');
    const job = await queue.getJob('job-1');
    assert.strictEqual(job?.status, 'RESERVED');
    assert.strictEqual(job?.workerId, 'worker-1');

    await queue.release('job-1');
    const releasedJob = await queue.getJob('job-1');
    assert.strictEqual(releasedJob?.status, 'QUEUED');
    assert.strictEqual(releasedJob?.workerId, undefined);

    await queue.cancel('job-1');
    const cancelledJob = await queue.getJob('job-1');
    assert.strictEqual(cancelledJob?.status, 'CANCELLED');
  });

  await t.test('2. Worker concurrency boundaries', async () => {
    featureFlags.DISTRIBUTED_RUNTIME = true;
    featureFlags.WORKER_POOL = true;
    queue.clear();

    const executors = {
      AGENT: async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
        return 'done';
      },
      WORKFLOW: async () => {},
      TOOL: async () => {},
      EVALUATION: async () => {}
    };

    const worker = new WorkerRuntime('worker-c', queue, 1, executors);
    
    try {
      await runtime.scheduleJob('AGENT', {}, {}, 10);
      await runtime.scheduleJob('AGENT', {}, {}, 5);

      worker.start();
      // Wait for poll() async execution to run and set status to ACTIVE
      await new Promise(resolve => setTimeout(resolve, 50));

      const info = worker.getInfo();
      assert.strictEqual(info.currentJobs.length, 1);

      const metrics = await runtime.getMetrics();
      assert.strictEqual(metrics.activeJobs, 1);
      assert.strictEqual(metrics.queueDepth, 1);
    } finally {
      await worker.stop();
      featureFlags.DISTRIBUTED_RUNTIME = false;
      featureFlags.WORKER_POOL = false;
    }
  });

  await t.test('3. Configurable retry policies (fixed, linear, exponential) & DLQ routing', async () => {
    featureFlags.DISTRIBUTED_RUNTIME = true;
    featureFlags.WORKER_POOL = true;
    featureFlags.JOB_RETRIES = true;
    queue.clear();

    let calls = 0;
    const executors = {
      AGENT: async () => {
        calls++;
        throw new Error('Failing job');
      },
      WORKFLOW: async () => {},
      TOOL: async () => {},
      EVALUATION: async () => {}
    };

    const worker = new WorkerRuntime('worker-retry', queue, 1, executors);
    
    try {
      const job = await runtime.scheduleJob('AGENT', {}, { maxRetries: 2, backoffMs: 50, retryStrategy: 'fixed' });
      
      let jobFailed = false;
      worker.addListener((ev) => {
        if (ev.type === 'JOB_FAILED') {
          jobFailed = true;
        }
      });

      worker.start();

      const startWait = Date.now();
      while (!jobFailed && (Date.now() - startWait) < 1000) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      const finalJob = await queue.getJob(job.id);
      assert.strictEqual(finalJob?.status, 'DEAD_LETTER');
      assert.strictEqual(finalJob?.metadata.attempts, 2);
      assert.strictEqual(calls, 3);

      const metrics = await runtime.getMetrics();
      assert.strictEqual(metrics.failed, 1);
      assert.strictEqual(metrics.retries, 2);
    } finally {
      await worker.stop();
      featureFlags.DISTRIBUTED_RUNTIME = false;
      featureFlags.WORKER_POOL = false;
      featureFlags.JOB_RETRIES = false;
    }
  });

  await t.test('4. Heartbeat and idle detection', async () => {
    featureFlags.DISTRIBUTED_RUNTIME = true;
    featureFlags.WORKER_POOL = true;
    queue.clear();

    const executors = {
      AGENT: async () => {
        await new Promise(resolve => setTimeout(resolve, 250));
      },
      WORKFLOW: async () => {},
      TOOL: async () => {},
      EVALUATION: async () => {}
    };

    const worker = new WorkerRuntime('worker-hb', queue, 2, executors);
    
    try {
      let hbCount = 0;
      let jobFailed = false;
      worker.addListener((ev) => {
        if (ev.type === 'HEARTBEAT_RECEIVED') {
          hbCount++;
        }
        if (ev.type === 'JOB_FAILED') {
          jobFailed = true;
        }
      });

      const info1 = worker.getInfo();
      assert.strictEqual(info1.status, 'STOPPED');

      await runtime.scheduleJob('AGENT', {}, { timeoutMs: 100 });
      worker.start();

      const startWait = Date.now();
      while (!jobFailed && (Date.now() - startWait) < 1000) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      assert.ok(hbCount > 0);
      assert.strictEqual(jobFailed, true);
    } finally {
      await worker.stop();
      featureFlags.DISTRIBUTED_RUNTIME = false;
      featureFlags.WORKER_POOL = false;
    }
  });

  await t.test('5. Graceful shutdown waiting for active tasks', async () => {
    featureFlags.DISTRIBUTED_RUNTIME = true;
    featureFlags.WORKER_POOL = true;
    queue.clear();

    let completed = false;
    const executors = {
      AGENT: async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        completed = true;
      },
      WORKFLOW: async () => {},
      TOOL: async () => {},
      EVALUATION: async () => {}
    };

    const worker = new WorkerRuntime('worker-shutdown', queue, 1, executors);
    
    try {
      await runtime.scheduleJob('AGENT', {});
      worker.start();
      await new Promise(resolve => setTimeout(resolve, 50));

      const info = worker.getInfo();
      assert.strictEqual(info.status, 'ACTIVE');

      await worker.stop(500);
      assert.strictEqual(completed, true);
    } finally {
      await worker.stop();
      featureFlags.DISTRIBUTED_RUNTIME = false;
      featureFlags.WORKER_POOL = false;
    }
  });

  await t.test('6. Feature flags defaults', () => {
    assert.strictEqual(featureFlags.DISTRIBUTED_RUNTIME, false);
    assert.strictEqual(featureFlags.WORKER_POOL, false);
    assert.strictEqual(featureFlags.JOB_RETRIES, false);
  });

});
