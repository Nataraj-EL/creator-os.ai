# AI Middleware Integration for Generation (Sprint 5)

This document describes how the AI Middleware Runtime is integrated into the shared content generation pipeline of CreatorOS.

---

## Integration Architecture

Instead of injecting middleware execution directly into UI page components, we wrapped the central generation entry point in a shared service layer:

```text
[UI: Content Studio]
       │
       ▼ (calls generateContent)
[src/lib/generationService.ts] ── wraps ──► [AIMiddlewareRunner]
                                                │
                                                ├─► 1. TraceMiddleware (Generates context IDs)
                                                ├─► 2. TimingMiddleware (Starts latency clocks)
                                                ├─► 3. LoggingMiddleware (Emits start audit logs)
                                                ├─► 4. GenerationHandler (Calls backend Axios)
                                                ├─► 5. LoggingMiddleware (Emits success logs)
                                                ├─► 6. EvaluationMiddleware (Runs audits async)
                                                └─► 7. TimingMiddleware (Closes timing metrics)
```

---

## Outbound Trace Propagation

* **Optional Trace Headers**: Outbound backend requests are supplemented with headers `X-Request-Id` and `X-Trace-Id`.
* **Zero Dependency**: These headers are internal tracing metadata; if the target endpoint does not process them, they are ignored without causing API failures.

---

## Fail-Open Design

A critical requirement of the AI Middleware integration is **fail-open robustness**:
* **Evaluation Non-Blocking**: The `EvaluationMiddleware` runs the `evaluate()` operation in a separate async promise chain.
* **Error Containment**: Any evaluation failure (e.g. rate limit drops, missing API keys, or timeout errors) is caught locally inside the middleware promise `.catch` block and logged.
* **Unhindered Generation**: Generation output returns immediately to the client UI. The user's content creation workflow is never delayed, blocked, or altered by evaluation issues.

---

## Integration Test Coverage (`npm run test:integration`)

The integration test suite validates these core properties using stubs for Axios requests and the evaluation service:
1. **Output Preservation**: Verifies that the wrapped response matches the Axios payload format.
2. **Context Propagation**: Asserts that context request/trace IDs are passed inside the Axios configuration object headers.
3. **Feature Flag Check**: Verifies that when the evaluation toggle is disabled, the evaluation service is bypassed completely.
4. **Fail-Open Verification**: Asserts that generation succeeds even if the evaluation service throws exceptions.
