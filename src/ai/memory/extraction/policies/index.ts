import { MemoryPolicy, MemoryCandidate, PolicyResult } from '../types';
import { MemoryService, MemoryContext } from '../../types';

export class ImportancePolicy implements MemoryPolicy {
  public name = 'ImportancePolicy';
  private minImportance: number;

  constructor(minImportance: number = 5) {
    this.minImportance = minImportance;
  }

  public evaluate(candidate: MemoryCandidate): PolicyResult {
    const score = candidate.importance / 10;
    const approved = candidate.importance >= this.minImportance;
    return {
      policyName: this.name,
      approved,
      score,
      reason: approved 
        ? `Approved: Importance score ${candidate.importance} is >= minimum threshold ${this.minImportance}.`
        : `Rejected: Importance score ${candidate.importance} is below minimum threshold ${this.minImportance}.`
    };
  }
}

export class DuplicatePolicy implements MemoryPolicy {
  public name = 'DuplicatePolicy';
  private memoryService: MemoryService;

  constructor(memoryService: MemoryService) {
    this.memoryService = memoryService;
  }

  public async evaluate(candidate: MemoryCandidate, context: MemoryContext): Promise<PolicyResult> {
    const existing = await this.memoryService.search(context, {
      text: candidate.content
    });

    const normalizedCandidate = candidate.content.trim().toLowerCase();
    const exactMatch = existing.find(r => r.content.trim().toLowerCase() === normalizedCandidate);

    if (exactMatch) {
      return {
        policyName: this.name,
        approved: false,
        score: 0.0,
        reason: `Rejected: Found exact duplicate memory with ID ${exactMatch.id}.`
      };
    }

    return {
      policyName: this.name,
      approved: true,
      score: 1.0,
      reason: 'Approved: No duplicate memories found.'
    };
  }
}

export class FreshnessPolicy implements MemoryPolicy {
  public name = 'FreshnessPolicy';
  private minConfidence: number;

  constructor(minConfidence: number = 0.7) {
    this.minConfidence = minConfidence;
  }

  public evaluate(candidate: MemoryCandidate): PolicyResult {
    const approved = candidate.confidence >= this.minConfidence;
    return {
      policyName: this.name,
      approved,
      score: candidate.confidence,
      reason: approved
        ? `Approved: Extraction confidence ${Math.round(candidate.confidence * 100)}% is >= minimum threshold ${Math.round(this.minConfidence * 100)}%.`
        : `Rejected: Extraction confidence ${Math.round(candidate.confidence * 100)}% is below minimum threshold ${Math.round(this.minConfidence * 100)}%.`
    };
  }
}
