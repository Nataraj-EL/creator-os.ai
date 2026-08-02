# Semantic Retrieval Foundation (Sprint 11 & 12)

The Semantic Retrieval Foundation provides a provider-agnostic layer for embedding generation, vector indexing, metadata filtering, and pluggable hybrid ranking (combining semantic and keyword search scores).

---

## Technical Architecture

The semantic search lifecycle runs embedding generations, vector query lookups, and score calculations.

```text
       ┌────────────────────────────────────────────────────────┐
       │                 RetrievalQuery Payload                 │
       └───────────────────────────┬────────────────────────────┘
                                   │
                      Run Search mode check
                                   │
             ┌─────────────────────┴─────────────────────┐
             ▼ (semanticSearch)                          ▼ (hybridSearch)
    [EmbeddingService]                          [EmbeddingService]
  Generate query vector                       Generate query vector
             │                                           │
             ▼                                           ▼
    [VectorStoreProvider]                       [VectorStoreProvider]
    Query topK candidate                        Query topK candidate
   cosine similarities list                    cosine similarities list
             │                                           │
             ▼                                           ▼
      similarityScore                              similarityScore
             │                                           │
             │                                           ▼
             │                                 Run keyword heuristics
             │                                      keywordScore
             │                                           │
             │                                           ▼
             │                             [HybridRankingStrategy.combine]
             │                                        finalScore
             │                                           │
             └─────────────────────┬─────────────────────┘
                                   │
                                   ▼
                       [RetrievalResult Struct]
                       * similarityScore
                       * keywordScore
                       * finalScore
                       * RetrievalMetadata
```

---

## Context → Retrieval → Memory Integration (Sprint 12)

The unified retrieval pipeline connects context assembly requests to underlying memory stores:

```text
       ┌────────────────────────────────────────────────────────┐
       │             ContextAssemblyRuntime.assemble()          │
       └───────────────────────────┬────────────────────────────┘
                                   │
                    Check flag: SEMANTIC_RETRIEVAL
                                   │
               ┌───────────────────┴───────────────────┐
               ▼ (Enabled)                             ▼ (Disabled / Fallback)
      [RetrievalSearchService]                  [MemoryService.search()]
    semanticSearch / hybridSearch                 Traditional Keyword Query
               │                                       │
               ▼ (Hydrated Results)                    │
      [RetrievalAdapter]                               │
    maps records to ContextBlocks                      │
               │                                       │
               └───────────────────┬───────────────────┘
                                   │
                                   ▼
             [Deduplication / Ranking / Compression]
                                   │
                                   ▼
                        Final ContextResult
```

### 1. N+1 Retrieval Prevention
By packing the original `MemoryRecord` directly into the `RetrievalResult.memoryRecord` property, we prevent the Context layer from making N+1 queries. When querying vectors from database indexes (e.g. pgvector), the system performs a single SQL JOIN between the vector and memory tables, returning fully hydrated results in one query.

### 2. Retrieval Adapter Decoupling
To keep the Context layer clean and retrieval-agnostic, the `RetrievalAdapter` maps the results:
```typescript
const blocks = RetrievalAdapter.mapToContextBlocks(results);
```
`ContextAssemblyRuntime` never accesses or understands the internals of `RetrievalResult`.

### 3. Fail-Open Fallback
If semantic search is disabled, missing a provider, or throws an exception, the system immediately catches the failure and falls back to keyword searches via the `MemoryService.search()`, ensuring generation pipelines never crash.

---

## Provider-Agnostic Embedding Result (`EmbeddingResult`)

Embedding models return a structured result:
* `vector`: The computed floating point coordinate array.
* `dimension`: The dimension length (e.g., 1536 for text-embedding-ada-002, 4 for mock).
* `model`: Model name.
* `provider`: Target API adapter.
* `embeddingVersion`: Version control string.
* `metadata`: Dynamic debug metrics.

---

## Pluggable Hybrid Strategies (`HybridRankingStrategy`)

Instead of hardcoded 50/50 scoring, the hybrid score combines metrics using the `HybridRankingStrategy` interface:
```typescript
export interface HybridRankingStrategy {
  name: string;
  combine(semanticScore: number, keywordScore: number): number;
}
```

The default `WeightedHybridStrategy` maps scoring using linear combination weights:
$$\text{finalScore} = (W_{\text{semantic}} \times S_{\text{semantic}}) + (W_{\text{keyword}} \times S_{\text{keyword}})$$

---

## Vector Indexer Interface (`VectorIndexer`)

To support future reindexing operations (e.g. background job re-runs), the `VectorIndexer` interface exposes upsert methods:
```typescript
export interface VectorIndexer {
  upsert(id: string, text: string, metadata: Record<string, any>): Promise<void>;
  reindex(ids: string[]): Promise<void>;
}
```

---

## Future PostgreSQL pgvector Integration

To replace the in-memory vector store with `pgvector`:
1. **DB Setup**: Enable `vector` extension in PostgreSQL:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
2. **Schema Table**: Create or alter table to contain a `vector` column:
   ```sql
   ALTER TABLE memories ADD COLUMN embedding vector(1536);
   ```
3. **Provider Class**: Implement a `PgVectorStoreProvider` extending `VectorStoreProvider`.
4. **Cosine Lookup**: Query using the cosine operator `<=>`:
   ```sql
   SELECT id, content, 1 - (embedding <=> $1) AS similarity 
   FROM memories 
   WHERE creator_id = $2
   ORDER BY similarity DESC 
   LIMIT $3;
   ```
5. **Registry Injection**: Register the `PgVectorStoreProvider` with `vectorStoreRegistry.register(pgProvider, true)`. No downstream changes are required!
