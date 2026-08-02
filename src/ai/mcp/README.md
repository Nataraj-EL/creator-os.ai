# Model Context Protocol (MCP) Runtime (Sprint 25)

A provider-agnostic MCP client-server Runtime supporting pluggable transport channels, capability registries, request pipelines, resource caches, and discovery providers.

---

## Architectural Schema

```mermaid
graph TD
  Discovery[MCPDiscoveryProvider] --> Registry[MCPRegistry Discovery]
  Registry --> Runtime[MCPRuntime Core Orchestrator]
  Runtime --> Session[SessionManager Transport lifecycles]
  Session --> Transport[MCPTransport WebSocket/HTTP/Stdio/InMemory]
  Runtime --> Pipeline[RequestPipeline JSON-RPC Messages]
  Pipeline --> Transport
  Runtime --> Cache[ResourceCache InMemory Cache]
  Runtime --> Adapter[MCPToolAdapter wraps MCPTool as standard Tool]
```

### 1. Pluggable Transports
Outsources connection channels to concrete classes implementing `MCPTransport` (Stdio, WebSocket, HTTP, and `InMemoryTransport` for local tests).

### 2. RequestPipeline
Handles serialization, transport delivery, validation boundaries, and JSON-RPC response resolutions.

### 3. Capability Registries
Monitors negotiated tool, resource, and prompt matrices via `MCPCapabilityRegistry`.

### 4. Discovery Providers
Decouples registry lookups using `MCPDiscoveryProvider` layers (like `RegistryDiscoveryProvider`).
