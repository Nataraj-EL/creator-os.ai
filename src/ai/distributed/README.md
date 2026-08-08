# Distributed Execution Runtime (Sprint 28)

A provider-agnostic distributed scheduling and task execution framework coordinating worker pools, reserve/release patterns, retry backoffs, and dead-letter queues under DISTRIBUTED_RUNTIME feature flags.

---

## Architecture Flow

```mermaid
graph TD
  Job[Distributed Job] --> Enqueue[QueueAdapter.enqueue]
  Enqueue --> Dequeue[WorkerRuntime.poll dequeue]
  Dequeue --> Reserve[QueueAdapter.reserve locked]
  Reserve --> Execute[Executors execute]
  Execute --> Ack[Success -> acknowledge COMPLETED]
  Execute --> Fail[Fail -> retry count checks]
  
  Fail --> |Attempts < Max| Retry[retry status backoff]
  Fail --> |Attempts >= Max| DLQ[deadLetter DEAD_LETTER]
```

### 1. States & Metrics
Traces jobs through stages (`QUEUED`, `RESERVED`, `RUNNING`, `COMPLETED`, `FAILED`, `RETRYING`, `CANCELLED`, `DEAD_LETTER`) while exporting metrics (`queueDepth`, `activeJobs`, `completed`, `failed`, `retries`).

### 2. Retry Backoffs
Supports fixed, linear, and exponential backoff calculations:
- `fixed`: stays static base interval.
- `linear`: expands base interval proportionally.
- `exponential`: doubles base interval exponentially.
 
 ### 3. Graceful Shutdown
 Stops new dequeues, letting running items conclude before final worker pool shutdowns.
 
---

## Production Redis & BullMQ Configuration

Feature flags (in `config/featureFlags.ts`):
*   `REDIS_QUEUE`: Enables Redis-backed job storage.
*   `BULLMQ_WORKERS`: Enables BullMQ processing registration.

### Environment Credentials
*   `REDIS_URL` (resolved from `ConfigRuntime` or standard environment variables): Native Redis TCP/TLS URL string (e.g. `redis://default:token@host:port` or `rediss://...` for TLS).
*   HTTP REST variables (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) are **not** supported by BullMQ/ioredis.
*   If the native connection string is missing or connection fails during startup, the runtime defaults to `InMemoryQueueAdapter`.
*   If connection fails during active operations, error bounds propagate to ensure job consistency (no silent fallback).
