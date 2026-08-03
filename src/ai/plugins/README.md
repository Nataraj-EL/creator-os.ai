# AI Plugin & Extension SDK (Sprint 27)

A provider-agnostic plugin execution runtime resolving version dependencies, managing isolated context environments, and allowing external extension registration under PLUGIN_RUNTIME feature flags.

---

## State Transitions

```mermaid
stateDiagram-click
  [*] --> INSTALLED: install()
  INSTALLED --> INITIALIZED: initialize()
  INITIALIZED --> ACTIVE: activate()
  ACTIVE --> INACTIVE: deactivate()
  INACTIVE --> ACTIVE: activate()
  ACTIVE --> UNINSTALLED: uninstall()
  INACTIVE --> UNINSTALLED: uninstall()
  ERROR --> UNINSTALLED: uninstall()
```

### 1. Version Constraints
Enforces semantic version matches (`^`, `~`, `>=`) for requirements resolution during dependency load ordering.

### 2. Dependency Resolution Cache
Utilizes Kahn's topological sort algorithms to determine correct loading order, caching execution sequences for subsequent reloads.

### 3. PluginContext
Provides isolated context references (`logger`, `config`, registries maps, `services`) during lifecycle events execution.

### 4. Clean Unloads
Guarantees unregistering plugins invokes deactivation hooks that remove contributed policies, tools, and workflows from core registries.
