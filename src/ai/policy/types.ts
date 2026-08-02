export type PolicyStage = 
  | 'PRE_PROVIDER' 
  | 'POST_PROVIDER' 
  | 'PRE_TOOL' 
  | 'POST_TOOL' 
  | 'PRE_MEMORY' 
  | 'POST_MEMORY';

export type PolicySeverity = 
  | 'INFO' 
  | 'LOW' 
  | 'MEDIUM' 
  | 'HIGH' 
  | 'CRITICAL';

export type PolicyDecision = 
  | 'ALLOW' 
  | 'BLOCK' 
  | 'MODIFY' 
  | 'WARN';

export interface PolicyResult {
  decision: PolicyDecision;
  modifiedContent?: any;
  reason?: string;
  policyId: string;
}

export interface PolicyContext {
  requestId?: string;
  traceId?: string;
  creatorId?: string;
  provider?: string;
  model?: string;
  workflowId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
  variables?: Record<string, any>;
}

export interface Policy {
  id: string;
  version: string;
  description?: string;
  tags?: string[];
  stage: PolicyStage;
  severity: PolicySeverity;
  priority: number; // Policies executed sorted in ascending order of priority (lower number runs first)
  enabled: boolean;
  evaluate(content: any, context: PolicyContext): PolicyResult | Promise<PolicyResult>;
}

export interface PolicyExecutionReport {
  stage: PolicyStage;
  passed: boolean;
  originalContent: any;
  finalContent: any;
  modified: boolean;
  modifications: { policyId: string; before: any; after: any; reason?: string }[];
  warnings: { policyId: string; reason: string; severity: PolicySeverity }[];
  errors: { policyId: string; error: string }[];
  durationMs: number;
}

export class PolicyError extends Error {
  constructor(
    public readonly policyId: string,
    public readonly reason: string,
    public readonly severity: PolicySeverity,
    public readonly stage: PolicyStage
  ) {
    super(`Policy Blocked: Policy "${policyId}" triggered block decision at stage "${stage}". Reason: ${reason} (Severity: ${severity})`);
    this.name = 'PolicyError';
  }

  public toJSON() {
    return {
      name: this.name,
      message: this.message,
      policyId: this.policyId,
      reason: this.reason,
      severity: this.severity,
      stage: this.stage
    };
  }
}

export type PolicyEventType = 
  | 'POLICY_STARTED' 
  | 'POLICY_PASSED' 
  | 'POLICY_BLOCKED' 
  | 'POLICY_MODIFIED' 
  | 'POLICY_COMPLETED';

export interface PolicyEvent {
  type: PolicyEventType;
  timestamp: string;
  policyId?: string;
  stage?: PolicyStage;
  durationMs?: number;
  details?: Record<string, any>;
}

export type PolicyListener = (event: PolicyEvent) => void;
