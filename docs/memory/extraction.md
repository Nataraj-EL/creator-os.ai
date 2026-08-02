# AI Memory Extraction & Automatic Learning Module (Sprint 10 & 13)

The AI Memory Extraction module parses input contents (like creator chats or request payloads) to extract candidate memories, runs them through pluggable policies yielding structured evaluation scores, and routes them via an independent decision engine to resolve final memory states.

In Sprint 13, this is integrated into the automatic learning pipeline, allowing completed generations to asynchronously update the long-term memory store.

---

## Complete Pipeline Architecture Flow

The complete, end-to-end memory learning and semantic context retrieval lifecycle is organized as follows:

```text
       ┌────────────────────────────────────────────────────────┐
       │               Content Generation Pipeline              │
       └───────────────────────────┬────────────────────────────┘
                                   │
                     Invoke MemoryLearningMiddleware
                                   │
                                   ▼
                       [MemoryLearningService]
                     Enforce Idempotency Checks
                      (skip if duplicate reqId)
                                   │
                                   ▼
                      [MemoryLearningDispatcher]
                     Dispatch to background queue
                                   │
       ┌───────────────────────────┴───────────────────────────┐
       ▼ (Background Thread execution - fire-and-forget)       ▼ (Returns immediately)
     [MemoryExtractor]                                     Complete Generation
   Parse Prompt + Content                                  and Evaluation loops
              │
              ▼
   Evaluate Policy Checks
              │
              ▼
   [MemoryDecisionEngine]
  Resolve: ACCEPT/UPDATE/MERGE
              │
              ▼
       [MemoryService] ◄───────────────────────────────────────┐
     Write to database / store                                 │
              │                                                │
              ▼                                                │
    [RetrievalSearchService] ──────────────────────────┐       │
  Query vectors & cosine similarities                  │       │
              │                                        ▼       │
              ▼                                   [Read/Write] │
     [RetrievalAdapter]                       [Memory Provider / DB]
   Translate results to ContextBlocks                  │
              │                                        │
              ▼                                        │
      [ContextAssembly] ───────────────────────────────┘
    Final deduplicated context block list
```

---

## Automatic Learning Components (Sprint 13)

### 1. Decoupled Memory Learning Service
`MemoryLearningMiddleware` remains extremely thin. It only triggers learning by delegating to a `MemoryLearningService` interface:
```typescript
interface MemoryLearningService {
  learn(context: MemoryContext, prompt: string, content: string, metadata?: Record<string, any>): Promise<MemoryExtractionResult[]>;
}
```

### 2. Background Queue Dispatcher
All extraction operations execute asynchronously inside a `MemoryLearningDispatcher` queue (defaulting to a `Promise.resolve().then()` thread dispatcher), preventing any delays or failures in content generation.

### 3. Idempotency Safeguards
`DefaultMemoryLearningService` tracks processed request and trace IDs in a size-limited cache to prevent duplicate extractions on repeated or retried generation requests.

### 4. Custom Events Observability
Learning pipelines emit `MEMORY_LEARNING_STARTED`, `MEMORY_LEARNING_COMPLETED`, and `MEMORY_LEARNING_FAILED` lifecycle events, detailing latency, decision counts, and stored contents.

---

## Technical Architecture

The extractor generates candidate blocks, delegates evaluations to registered policies, and resolves actions using the pluggable `MemoryDecisionEngine`.

```text
       ┌────────────────────────────────────────────────────────┐
       │                Input Content (Sentence)                │
       └───────────────────────────┬────────────────────────────┘
                                   │
                       Run Heuristics Regex Parser
                                   │
                                   ▼
                   [CANDIDATE_CREATED] MemoryCandidate
                                   │
                     Evaluate registered policies
                                   │
             ┌─────────────────────┼─────────────────────┐
             ▼                     ▼                     ▼
     [ImportancePolicy]    [DuplicatePolicy]     [FreshnessPolicy]
             │                     │                     │
             ▼                     ▼                     ▼
        PolicyResult          PolicyResult          PolicyResult
             │                     │                     │
             └─────────────────────┬─────────────────────┘
                                   │
                                   ▼
                       [MemoryDecisionEngine.resolve]
                                   │
             ┌─────────────────────┼─────────────────────┐
             ▼ (ACCEPT)            ▼ (IGNORE)            ▼ (REJECT)
      Call MemoryService       Skip storing           Log rejection
     Write to provider/DB                                 reasons
             │
             ▼
     [MEMORY_ACCEPTED]
```

---

## Pluggable Policies (`MemoryPolicy`)

Memory policies return a structured `PolicyResult` (with approval, confidence score, and evaluation reason):
* **`ImportancePolicy`**: Evaluates if the candidate's importance rating meets a target threshold (default >= 5).
* **`DuplicatePolicy`**: Queries the memory service. If an exact duplicate exists, disapproves with score `0.0`, triggering an `IGNORE` decision.
* **`FreshnessPolicy`**: Asserts the candidate's confidence rating meets a target threshold (default >= 0.7).

---

## Pluggable Decision Resolver (`MemoryDecisionEngine`)

The decision-making rules are isolated in `DefaultMemoryDecisionEngine`:
* **`ACCEPT`**: Stored in long-term memory via the `MemoryService`.
* **`REJECT`**: Bypassed and logged with detailed policy rejection reasons.
* **`IGNORE`**: Bypassed and discarded (used for duplicates to avoid log clutter).
* **`UPDATE_EXISTING` / `MERGE`**: Stored/updated in long-term memory.

---

## Lifecycle Observers

Subscribers can listen to extraction pipelines (`EXTRACTION_STARTED`, `CANDIDATE_CREATED`, `MEMORY_ACCEPTED`, `MEMORY_REJECTED`, `EXTRACTION_COMPLETED`):

```typescript
import { MemoryExtractor } from '@/ai/memory/extraction';

const extractor = new MemoryExtractor(memoryService);

extractor.addListener((event) => {
  console.log(`Extraction event: ${event.type} for context user ${event.context.userId}`);
});
```

---

## Extension Guidelines

### 1. Registering a Custom Policy
```typescript
import { MemoryPolicy, MemoryCandidate, PolicyResult } from '@/ai/memory/extraction';

class ContentLengthPolicy implements MemoryPolicy {
  public name = 'ContentLengthPolicy';
  public evaluate(candidate: MemoryCandidate): PolicyResult {
    const approved = candidate.content.length >= 10;
    return {
      policyName: this.name,
      approved,
      score: approved ? 1.0 : 0.0,
      reason: approved ? 'Length is valid' : 'Content too short'
    };
  }
}

extractor.registerPolicy(new ContentLengthPolicy());
```

### 2. Custom Decision Engines
```typescript
import { MemoryDecisionEngine, MemoryCandidate, PolicyResult, MemoryDecision } from '@/ai/memory/extraction';

class AutoIgnoreDecisionEngine implements MemoryDecisionEngine {
  public name = 'AutoIgnoreDecisionEngine';
  public resolve(candidate: MemoryCandidate, policyResults: PolicyResult[]): MemoryDecision {
    // Custom logic: always ignore instead of reject on failure
    const hasRejections = policyResults.some(pr => !pr.approved);
    return hasRejections ? MemoryDecision.IGNORE : MemoryDecision.ACCEPT;
  }
}
```

### 3. Future LLM-Assisted Extraction
To replace heuristics with LLMs:
1. Update `MemoryExtractor.extractCandidatesFromText`:
   Send text to Gemini structure endpoint (e.g. `StructuredOutput` payload).
2. Gemini returns structured JSON matching the `MemoryCandidate[]` schema.
3. Candidates are evaluated by the same policies and decision engine without modifying downstream code.
