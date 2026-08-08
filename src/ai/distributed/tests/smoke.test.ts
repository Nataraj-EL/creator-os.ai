import test from 'node:test';
import assert from 'node:assert';
import { BullMQQueueAdapter } from '../queue/bullmq';
import { Job } from '../types';
import { featureFlags } from '../config/featureFlags';

test('BullMQ Real Redis Smoke Test', async (t) => {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log('[BullMQ Smoke Test] REDIS_URL not configured. Skipping active integration checks.');
    return;
  }

  console.log(`[BullMQ Smoke Test] Running active connection checks against: ${redisUrl.split('@')[1] || 'localhost'}`);

  await t.test('E2E Enqueue -> Dequeue -> Process cycle', async () => {
    featureFlags.REDIS_QUEUE = true;
    const adapter = new BullMQQueueAdapter(redisUrl);
    
    await adapter.initialize();
    await adapter.clear();

    const testJob: Job = {
      id: `smoke-job-${Math.random().toString(36).substring(7)}`,
      type: 'EVALUATION',
      payload: { workspaceId: 'smoke-ws-123', tenantId: 'smoke-tenant-456', topic: 'smoke test data' },
      status: 'QUEUED',
      metadata: { priority: 20, attempts: 0 },
      policy: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 1. Enqueue
    await adapter.enqueue(testJob);

    // 2. Dequeue
    const grabbed = await adapter.dequeue('smoke-worker');
    assert.ok(grabbed);
    assert.strictEqual(grabbed.id, testJob.id);
    assert.strictEqual(grabbed.status, 'RESERVED');
    assert.strictEqual(grabbed.workerId, 'smoke-worker');
    assert.strictEqual(grabbed.payload.workspaceId, 'smoke-ws-123');

    // 3. Process & Acknowledge
    await adapter.acknowledge(testJob.id, {
      jobId: testJob.id,
      status: 'COMPLETED',
      durationMs: 15
    });

    // 4. Verify completed status
    const processed = await adapter.getJob(testJob.id);
    assert.ok(processed);
    assert.strictEqual(processed.status, 'COMPLETED');

    const metrics = await adapter.getMetrics();
    assert.strictEqual(metrics.completed, 1);

    await adapter.clear();
    await adapter.dispose();
  });
});
