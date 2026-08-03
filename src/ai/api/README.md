# API Gateway Runtime (Sprint 31)

A provider-agnostic, versioned, and priority-middleware driven API Gateway exposing all platform services under unified REST and streaming formats.

---

## Route Processing Pipeline

```mermaid
graph TD
  Request[Incoming Request] --> Match{Matches routes registry?}
  Match --> |No| NotFound[Return 404 NOT_FOUND]
  Match --> |Yes| Idempotency{Has Idempotency-Key?}
  
  Idempotency --> |In-Progress| Conflict[Return 409 CONFLICT]
  Idempotency --> |Resolved| Cached[Return Cached Response]
  Idempotency --> |New| Context[Freeze APIContext]
  
  Context --> Validate{Validate schema?}
  Validate --> |No| Pipeline[Sort & run Middlewares]
  Validate --> |Yes| ValidationError[Return 400 VALIDATION_ERROR]
  
  Pipeline --> Execute[Call Handler]
  Execute --> Serialize[Serialize output JSON/SSE]
```

### 1. Priority MiddlewareRegistry
Allows registering middleware hooks with priority bounds:
* `TracingMiddleware` (priority = 100) -> injects Trace ID.
* `AuthMiddleware` (priority = 80) -> validates bearer tokens.
* `TenantMiddleware` (priority = 60) -> resolves organizations.

### 2. Standardized API Error Codes
Exposes standardized errors: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `CANCELLED`, `TIMEOUT`, `PROVIDER_ERROR`, `INTERNAL_ERROR`.
