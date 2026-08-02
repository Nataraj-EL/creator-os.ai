# AI Observability & Trace Runtime

The Observability module provides unified, end-to-end tracing across the entire CreatorOS AI content generation pipeline. It uses an event-driven model to track the execution flow, latency metrics, status codes, and metadata inputs for all downstream stages.

## Architecture

The tracing system is built on three core layers:

```
[Services / Middlewares]
        │ (Publish events)
        ▼
   [TraceEventBus]
        │ (Deliver events)
        ▼
   [TraceRuntime]
        │ (Aggregate & Latency check)
        ▼
    [TraceStore] (Memory / localStorage)
```

1. **TraceEventBus**: A lightweight, decoupled publisher-subscriber event registry. Components publish standardized `TraceEvents` without direct dependencies on trace storage or formatting.
2. **TraceRuntime**: Listens to published events, aggregates them under `traceId` collections, sorts them chronologically, and calculates stage latencies.
3. **TraceStore**: Persistent trace storage backend. Implements a `HybridTraceStore` that syncs to memory (for Node/test runtimes) and `localStorage` (for browser sandbox environments).

---

## Standardized Trace Stages

The pipeline captures telemetry across the following stages:

* **middleware**: Boundaries of pipeline execution (`TraceMiddleware`, `TimingMiddleware`, `LoggingMiddleware`, `EvaluationMiddleware`).
* **context**: Context retrieval and injection runtime (`ContextAssemblyRuntime`).
* **retrieval**: Semantic vector matching and keyword search rankings (`RetrievalService`).
* **prompt-builder**: Dynamic prompt generation (`PromptBuilder`).
* **evaluation**: LLM-Judge scoring and compliance auditing (`EvaluationService`).
* **memory-learning**: Background memory extraction and learning processes (`MemoryLearningService`).
* **memory-runtime**: Memory read/write storage cycles (`MemoryRuntime`).

---

## API Reference

### Event Bus Publish
```typescript
import { traceEventBus } from '../observability';

traceEventBus.publish({
  traceId: context.traceId,
  requestId: context.requestId,
  stage: 'context',
  component: 'ContextAssemblyRuntime',
  status: 'started',
  metadata: { strategy: 'BALANCED' }
});
```

### Retrieving Traces
```typescript
import { traceRuntime } from '../observability';

const trace = await traceRuntime.getTrace(traceId);
```
