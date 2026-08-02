import { MemoryType, MemoryContext } from '../types';

export interface MemoryCandidate {
  content: string;
  type: MemoryType;
  confidence: number; // 0.0 to 1.0
  importance: number; // 1 to 10 scale
  source: string;
  reasoning: string;
}

export enum MemoryDecision {
  ACCEPT = 'ACCEPT',
  REJECT = 'REJECT',
  UPDATE_EXISTING = 'UPDATE_EXISTING',
  MERGE = 'MERGE',
  IGNORE = 'IGNORE'
}

export interface PolicyResult {
  policyName: string;
  approved: boolean;
  score: number; // 0.0 to 1.0
  reason: string;
}

export interface MemoryExtractionResult {
  candidate: MemoryCandidate;
  decision: MemoryDecision;
  policyResults: PolicyResult[];
  reasoning: string;
}

export interface MemoryPolicy {
  name: string;
  evaluate(candidate: MemoryCandidate, context: MemoryContext): Promise<PolicyResult> | PolicyResult;
}

export interface MemoryDecisionEngine {
  name: string;
  resolve(candidate: MemoryCandidate, policyResults: PolicyResult[]): MemoryDecision;
}

export type ExtractionLifecycleEventType = 
  | 'EXTRACTION_STARTED'
  | 'CANDIDATE_CREATED'
  | 'MEMORY_ACCEPTED'
  | 'MEMORY_REJECTED'
  | 'EXTRACTION_COMPLETED';

export interface ExtractionLifecycleEvent {
  type: ExtractionLifecycleEventType;
  timestamp: string;
  context: MemoryContext;
  details: Record<string, any>;
}

export type ExtractionLifecycleListener = (event: ExtractionLifecycleEvent) => void;
