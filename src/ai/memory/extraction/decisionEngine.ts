import { MemoryDecisionEngine, MemoryCandidate, PolicyResult, MemoryDecision } from './types';

export class DefaultMemoryDecisionEngine implements MemoryDecisionEngine {
  public name = 'DefaultMemoryDecisionEngine';

  public resolve(candidate: MemoryCandidate, policyResults: PolicyResult[]): MemoryDecision {
    const hasRejections = policyResults.some(pr => !pr.approved);
    
    if (!hasRejections) {
      return MemoryDecision.ACCEPT;
    }

    // Resolve specific rejection decisions: ignore exact duplicates, reject low confidence/importance
    const duplicateRejection = policyResults.find(pr => pr.policyName === 'DuplicatePolicy' && !pr.approved);
    if (duplicateRejection) {
      if (duplicateRejection.reason.toLowerCase().includes('exact duplicate')) {
        return MemoryDecision.IGNORE;
      }
    }

    return MemoryDecision.REJECT;
  }
}
