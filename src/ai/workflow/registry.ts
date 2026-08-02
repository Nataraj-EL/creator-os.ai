import { WorkflowDefinition } from './types';

export class WorkflowRegistry {
  private definitions: Map<string, Map<string, WorkflowDefinition>> = new Map();

  public register(definition: WorkflowDefinition): void {
    let versions = this.definitions.get(definition.id);
    if (!versions) {
      versions = new Map();
      this.definitions.set(definition.id, versions);
    }

    if (versions.has(definition.version)) {
      throw new Error(`Workflow definition "${definition.id}" with version "${definition.version}" is already registered.`);
    }

    // Freeze definition to ensure immutability
    const frozenDefinition = Object.freeze({
      ...definition,
      steps: Object.freeze({ ...definition.steps })
    });

    versions.set(definition.version, frozenDefinition);
  }

  public unregister(id: string, version?: string): void {
    if (version) {
      const versions = this.definitions.get(id);
      if (versions) {
        versions.delete(version);
        if (versions.size === 0) {
          this.definitions.delete(id);
        }
      }
    } else {
      this.definitions.delete(id);
    }
  }

  public resolve(id: string, version?: string): WorkflowDefinition {
    const versions = this.definitions.get(id);
    if (!versions || versions.size === 0) {
      throw new Error(`Workflow with ID "${id}" not found in registry.`);
    }

    if (version) {
      const def = versions.get(version);
      if (!def) {
        throw new Error(`Workflow version "${version}" for ID "${id}" not found.`);
      }
      return def;
    }

    // Default to the latest registered version (sorted lexicographically/semver-like)
    const sortedVersions = Array.from(versions.keys()).sort((a, b) => b.localeCompare(a));
    const latestVersion = sortedVersions[0];
    return versions.get(latestVersion)!;
  }

  public clear(): void {
    this.definitions.clear();
  }
}
