import { Policy, PolicyStage } from './types';

export class PolicyRegistry {
  private policies: Map<string, Policy> = new Map();

  public register(policy: Policy): void {
    if (this.policies.has(policy.id)) {
      throw new Error(`Policy with ID "${policy.id}" is already registered.`);
    }
    this.policies.set(policy.id, policy);
  }

  public unregister(id: string): void {
    this.policies.delete(id);
  }

  public replace(policy: Policy): void {
    this.policies.set(policy.id, policy);
  }

  public resolve(id: string): Policy {
    const policy = this.policies.get(id);
    if (!policy) {
      throw new Error(`Policy with ID "${id}" not found.`);
    }
    return policy;
  }

  public enable(id: string): void {
    const policy = this.policies.get(id);
    if (policy) {
      policy.enabled = true;
    }
  }

  public disable(id: string): void {
    const policy = this.policies.get(id);
    if (policy) {
      policy.enabled = false;
    }
  }

  public getPolicies(stage?: PolicyStage): Policy[] {
    let list = Array.from(this.policies.values());
    if (stage) {
      list = list.filter(p => p.stage === stage);
    }
    return list.sort((a, b) => a.priority - b.priority);
  }

  public clear(): void {
    this.policies.clear();
  }
}
