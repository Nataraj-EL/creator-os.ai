# AI Context Assembly Engine (Sprint 7)

The AI Context Assembly Engine is a pluggable context optimizer that retrieves memories and knowledge assets, applies ranking strategies, filters duplicates, and compiles context blocks to fit target LLM token budgets.

---

## Technical Architecture

The engine uses a pluggable registry to load sorting strategies, processes blocks through a pipeline, and enforces token constraints via customizable compressors.

```text
               ┌──────────────────────────────┐
               │    Context Request Context   │
               └──────────────┬───────────────┘
                              │
               [ASSEMBLY_STARTED] Check flags: CONTEXT_ENABLED
                              │
                              ▼
           [Memory / Knowledge Search Retrieval] ──► [RETRIEVAL_COMPLETED]
                              │
                              ▼
           [Deduplication: drop duplicate IDs/text]
                              │
                              ▼
           [Pluggable Ranking Strategy Selector] ──► [RANKING_COMPLETED]
            (Balanced, Recency, Importance, Semantic)
                              │
                              ▼
           [Extensible Compression Pipeline]   ──► [COMPRESSION_COMPLETED]
            (TokenBudgetCompressor / Custom)
                              │
                              ▼
           [ContextResult with selectionReason] ──► [ASSEMBLY_COMPLETED]
```

---

## Pluggable Strategy Registry (`ContextRankingStrategyRegistry`)

Context ranking is resolved from a dynamic registry implementing the `ContextRankingStrategy` contract. Built-in ranking strategies include:

1. **`BALANCED`**: Evaluates a combined score using:
   `0.4 * relevanceScore + 0.3 * (importance / 10) + 0.3 * recencyDecay`
2. **`RECENCY_FIRST`**: Sorts descending by time.
3. **`IMPORTANCE_FIRST`**: Sorts descending by importance weight.
4. **`SEMANTIC_FIRST`**: Sorts descending by similarity relevance score.

Each ranked block is decorated with a `selectionReason` describing exactly why it was ordered (e.g. detailed score weights or timestamps), enabling developers to audit LLM prompts.

---

## Extensible Compression Pipeline (`ContextCompressor`)

The assembly engine treats the truncation/compression stage as a pluggable pipeline:
* **`TokenBudgetCompressor`** (Default): Aggregates context blocks in order, dropping subsequent blocks that would exceed the prompt token budget.
* **Extensible Design**: Developers can register or inject custom summarization-based compressors (e.g., calling smaller models to summarize long context blocks) by implementing the `ContextCompressor` interface.

---

## Event Subscriptions

Observers can subscribe to lifecycle stages (`ASSEMBLY_STARTED`, `RETRIEVAL_COMPLETED`, `RANKING_COMPLETED`, `COMPRESSION_COMPLETED`, `ASSEMBLY_COMPLETED`):

```typescript
import { ContextAssemblyRuntime } from '@/ai/context';

const runtime = new ContextAssemblyRuntime(memoryService);

runtime.addListener((event) => {
  console.log(`Context event: ${event.type} for request ${event.requestId}`);
});
```

---

## Technical Extension Guides

### 1. Registering a Custom Strategy
```typescript
import { ContextRankingStrategy, ContextBlock, contextRankingStrategyRegistry } from '@/ai/context';

class UserFeedbackRankingStrategy implements ContextRankingStrategy {
  public name = 'USER_FEEDBACK' as any;
  public rank(blocks: ContextBlock[]): ContextBlock[] {
    return [...blocks].sort((a, b) => {
      a.selectionReason = 'Ranked by feedback score';
      return (b.metadata.feedbackRating ?? 0) - (a.metadata.feedbackRating ?? 0);
    });
  }
}

// Register
contextRankingStrategyRegistry.register(new UserFeedbackFeedbackStrategy());
```

### 2. Registering a Custom Compressor
```typescript
import { ContextCompressor, ContextBlock } from '@/ai/context';

class LlmSummarizingCompressor implements ContextCompressor {
  public name = 'LlmSummarizingCompressor';
  public async compress(blocks: ContextBlock[], budget: number): Promise<ContextBlock[]> {
    // Truncate or summarize long blocks using a lightweight LLM endpoint
    return summarizeLargeBlocks(blocks, budget);
  }
}

// Inject into assembly runtime
const assembler = new ContextAssemblyRuntime(memoryService, undefined, new LlmSummarizingCompressor());
```
