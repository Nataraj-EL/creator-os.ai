# Observability & Tracing Runtime

A fail-safe telemetry engine implementing in-memory trace stores and remote Langfuse tracing providers linked directly to the application trace event bus.

---

## Configuration

Environment variables configuration variables:
*   `LANGFUSE_ENABLED` (feature flag: `featureFlags.LANGFUSE_ENABLED`): Set to `true` to enable.
*   `LANGFUSE_PUBLIC_KEY`: Langfuse public API key.
*   `LANGFUSE_SECRET_KEY`: Langfuse secret API key.
*   `LANGFUSE_HOST`: Optional host connection URL (defaults to `https://cloud.langfuse.com`).

### Privacy Settings
*   `LANGFUSE_CAPTURE_INPUT`: If `false` (default), all inputs, queries, and prompts are redacted.
*   `LANGFUSE_CAPTURE_OUTPUT`: If `false` (default), all outputs, generated scripts, and completions are redacted.
*   Sensitive headers (like `Authorization` or `X-API-Key`) are always automatically redacted from trace metadata.
