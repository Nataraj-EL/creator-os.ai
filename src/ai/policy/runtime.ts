import { 
  PolicyStage, 
  PolicyContext, 
  PolicyExecutionReport, 
  PolicyError, 
  PolicyEvent, 
  PolicyEventType, 
  PolicyListener,
  PolicyResult
} from './types';
import { PolicyRegistry } from './registry';
import { featureFlags } from './config/featureFlags';

export class PolicyRuntime {
  private listeners: Set<PolicyListener> = new Set();

  constructor(private registry: PolicyRegistry) {}

  public addListener(listener: PolicyListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: PolicyListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(
    type: PolicyEventType,
    policyId?: string,
    stage?: PolicyStage,
    durationMs?: number,
    details?: Record<string, any>
  ): void {
    const event: PolicyEvent = {
      type,
      timestamp: new Date().toISOString(),
      policyId,
      stage,
      durationMs,
      details
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[PolicyRuntime] Listener failed:", err);
      }
    }
  }

  public async evaluate(
    stage: PolicyStage,
    content: any,
    context: PolicyContext
  ): Promise<PolicyExecutionReport> {
    const startTime = Date.now();
    const report: PolicyExecutionReport = {
      stage,
      passed: true,
      originalContent: content,
      finalContent: content,
      modified: false,
      modifications: [],
      warnings: [],
      errors: [],
      durationMs: 0
    };

    if (!featureFlags.POLICY_RUNTIME) {
      report.durationMs = Date.now() - startTime;
      return report;
    }

    const policies = this.registry.getPolicies(stage);
    let currentContent = content;

    for (const policy of policies) {
      if (!policy.enabled) continue;

      const policyStartTime = Date.now();
      this.emitEvent('POLICY_STARTED', policy.id, stage);

      try {
        const evaluation = policy.evaluate(currentContent, context);
        const result: PolicyResult = evaluation instanceof Promise ? await evaluation : evaluation;

        const policyDuration = Date.now() - policyStartTime;

        if (result.decision === 'BLOCK') {
          report.passed = false;
          report.durationMs = Date.now() - startTime;
          this.emitEvent('POLICY_BLOCKED', policy.id, stage, policyDuration, { reason: result.reason || 'Blocked by policy' });
          throw new PolicyError(policy.id, result.reason || 'Blocked by policy', policy.severity, stage);
        }

        if (result.decision === 'MODIFY') {
          const before = currentContent;
          const after = result.modifiedContent;
          report.modified = true;
          report.modifications.push({
            policyId: policy.id,
            before,
            after,
            reason: result.reason
          });
          currentContent = after;
          this.emitEvent('POLICY_MODIFIED', policy.id, stage, policyDuration, { reason: result.reason });
        }

        if (result.decision === 'WARN') {
          report.warnings.push({
            policyId: policy.id,
            reason: result.reason || 'Policy warning triggered',
            severity: policy.severity
          });
        }

        this.emitEvent('POLICY_PASSED', policy.id, stage, policyDuration);
      } catch (err: any) {
        const policyDuration = Date.now() - policyStartTime;
        if (err instanceof PolicyError) {
          throw err;
        }
        report.errors.push({
          policyId: policy.id,
          error: err.message || 'Transient execution error'
        });
        console.error(`[PolicyRuntime] Fail-open: Policy "${policy.id}" failed:`, err);
        this.emitEvent('POLICY_COMPLETED', policy.id, stage, policyDuration, { error: err.message });
      }
    }

    report.finalContent = currentContent;
    report.durationMs = Date.now() - startTime;
    this.emitEvent('POLICY_COMPLETED', undefined, stage, report.durationMs);

    return report;
  }
}
