import { 
  MemoryCandidate, 
  MemoryPolicy, 
  MemoryDecisionEngine, 
  MemoryDecision, 
  PolicyResult,
  MemoryExtractionResult,
  ExtractionLifecycleEvent,
  ExtractionLifecycleListener,
  ExtractionLifecycleEventType
} from './types';
import { MemoryService, MemoryContext, MemoryType } from '../types';
import { DefaultMemoryDecisionEngine } from './decisionEngine';
import { extractionFeatureFlags } from './config/featureFlags';

export class MemoryExtractor {
  private memoryService: MemoryService;
  private decisionEngine: MemoryDecisionEngine;
  private policies: MemoryPolicy[] = [];
  private listeners: Set<ExtractionLifecycleListener> = new Set();

  constructor(
    memoryService: MemoryService,
    decisionEngine?: MemoryDecisionEngine,
    policies: MemoryPolicy[] = []
  ) {
    this.memoryService = memoryService;
    this.decisionEngine = decisionEngine || new DefaultMemoryDecisionEngine();
    this.policies = policies;
  }

  public registerPolicy(policy: MemoryPolicy): void {
    this.policies.push(policy);
  }

  public addListener(listener: ExtractionLifecycleListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: ExtractionLifecycleListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(type: ExtractionLifecycleEventType, context: MemoryContext, details: Record<string, any>): void {
    const event: ExtractionLifecycleEvent = {
      type,
      timestamp: new Date().toISOString(),
      context,
      details
    };

    console.log(`[${event.timestamp}] [AI-EXTRACT] [${type}] context: ${JSON.stringify(context)}, details: ${JSON.stringify(details)}`);

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error("[AI-EXTRACT] Lifecycle event listener threw error:", e);
      }
    }
  }

  // Heuristic-based sentence parser (LLM fallback placeholder)
  private extractCandidatesFromText(text: string): MemoryCandidate[] {
    const candidates: MemoryCandidate[] = [];

    // Future LLM-assisted extraction:
    // const response = await gemini.generateJson(text, SCHEMA_PROMPT);
    // ...

    const sentences = text.split(/[.!?]+/);
    for (const sentence of sentences) {
      const clean = sentence.trim();
      if (!clean) continue;

      // 1. Preference
      let match = clean.match(/I prefer (.*)/i);
      if (match) {
        candidates.push({
          content: `User preference: ${match[1]}`,
          type: MemoryType.PREFERENCE,
          confidence: 0.9,
          importance: 6,
          source: 'conversation',
          reasoning: 'Extracted user preference via heuristic match.'
        });
        continue;
      }

      // 2. Brand
      match = clean.match(/(?:our brand color is|our brand tone is|brand style is) (.*)/i);
      if (match) {
        candidates.push({
          content: `Brand constraint: ${match[1]}`,
          type: MemoryType.BRAND,
          confidence: 0.95,
          importance: 8,
          source: 'conversation',
          reasoning: 'Extracted brand detail via heuristic match.'
        });
        continue;
      }

      // 3. Profile
      match = clean.match(/my channel name is (.*)/i);
      if (match) {
        candidates.push({
          content: `Creator profile detail: channel is ${match[1]}`,
          type: MemoryType.PROFILE,
          confidence: 0.95,
          importance: 7,
          source: 'conversation',
          reasoning: 'Extracted creator profile name via heuristic match.'
        });
        continue;
      }

      // 4. Project
      match = clean.match(/the project title is (.*)/i);
      if (match) {
        candidates.push({
          content: `Project metadata: title is ${match[1]}`,
          type: MemoryType.PROJECT,
          confidence: 0.8,
          importance: 5,
          source: 'conversation',
          reasoning: 'Extracted project metadata via heuristic match.'
        });
        continue;
      }

      // 5. Knowledge
      match = clean.match(/the fact is (.*)/i);
      if (match) {
        candidates.push({
          content: `Fact statement: ${match[1]}`,
          type: MemoryType.KNOWLEDGE,
          confidence: 0.75,
          importance: 5,
          source: 'conversation',
          reasoning: 'Extracted factual detail via heuristic match.'
        });
        continue;
      }
    }

    return candidates;
  }

  // Primary extraction engine loop
  public async extract(context: MemoryContext, inputContent: string): Promise<MemoryExtractionResult[]> {
    const results: MemoryExtractionResult[] = [];
    
    this.emitEvent('EXTRACTION_STARTED', context, { contentLength: inputContent.length });

    if (!extractionFeatureFlags.MEMORY_EXTRACTION) {
      console.warn("[AI-EXTRACT] Extraction skipped: Extraction features disabled by feature flags.");
      this.emitEvent('EXTRACTION_COMPLETED', context, { resultsCount: 0 });
      return [];
    }

    // Heuristics parse
    const candidates = this.extractCandidatesFromText(inputContent);

    for (const candidate of candidates) {
      this.emitEvent('CANDIDATE_CREATED', context, { type: candidate.type, content: candidate.content });

      const policyResults: PolicyResult[] = [];

      // Evaluate policies if enabled
      if (extractionFeatureFlags.MEMORY_POLICIES) {
        for (const policy of this.policies) {
          try {
            const res = await policy.evaluate(candidate, context);
            policyResults.push(res);
          } catch (err) {
            console.error(`[AI-EXTRACT] Policy ${policy.name} evaluation threw error:`, err);
            policyResults.push({
              policyName: policy.name,
              approved: false,
              score: 0.0,
              reason: `Failed to evaluate policy due to error: ${err}`
            });
          }
        }
      } else {
        // Policies disabled: auto-approve
        policyResults.push({
          policyName: 'AutoApprovePolicy',
          approved: true,
          score: 1.0,
          reason: 'Policies check disabled by feature flags. Auto-approved.'
        });
      }

      // Resolve decision from decision engine
      const decision = this.decisionEngine.resolve(candidate, policyResults);

      const extractionResult: MemoryExtractionResult = {
        candidate,
        decision,
        policyResults,
        reasoning: `Decision resolved to ${decision}.`
      };

      results.push(extractionResult);

      // Execute decision
      if (
        decision === MemoryDecision.ACCEPT ||
        decision === MemoryDecision.UPDATE_EXISTING ||
        decision === MemoryDecision.MERGE
      ) {
        // accepted/updated candidates get stored in memory
        await this.memoryService.store(context, candidate.content, [candidate.type.toLowerCase(), 'extracted'], candidate.type, {
          importance: candidate.importance,
          confidence: candidate.confidence,
          source: candidate.source,
          metadata: { reasoning: candidate.reasoning, decision }
        });

        this.emitEvent('MEMORY_ACCEPTED', context, { content: candidate.content, type: candidate.type, decision });
      } else {
        this.emitEvent('MEMORY_REJECTED', context, { content: candidate.content, decision, reason: policyResults.map(p => p.reason).join(' | ') });
      }
    }

    this.emitEvent('EXTRACTION_COMPLETED', context, { resultsCount: results.length });
    return results;
  }
}
