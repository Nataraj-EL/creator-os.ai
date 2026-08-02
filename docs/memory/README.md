# AI Memory Runtime (Sprint 6)

The AI Memory Runtime is a modular, strongly typed, and decoupled system for storing, retrieving, updating, deleting, and searching creator preferences, brand profiles, and conversational contexts.

---

## Technical Architecture

The memory module resolves active storage adapters using a provider registry, checks granular access control flags, and broadcasts lifecycle triggers to registered observers.

```text
               ┌───────────────────────┐
               │    Memory Service     │
               └───────────┬───────────┘
                           │
             Check flags: MEMORY_ENABLED
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
       [Write Flags]                [Read Flags]
   (store, update, delete)       (retrieve, search)
             │                           │
   ┌─────────┴─────────┐       ┌─────────┴─────────┐
   ▼                   ▼       ▼                   ▼
[Provider]       [Repository] [Provider]       [Repository]
   │                   │       │                   │
   └─────────┬─────────┘       └─────────┬─────────┘
             │                           │
             ▼                           ▼
    Emit STORE/UPDATE/DELETE     Emit RETRIEVE/SEARCH
      lifecycle events             lifecycle events
```

---

## Memory Record Schema

Each `MemoryRecord` is enriched with access metrics, classifications, and search vectors:
* **`type`**: `MemoryType` enum classifying context types:
  * `PROFILE`: Long-term user bios and channels credentials.
  * `CONVERSATION`: User chats history and thread contextual memory.
  * `PREFERENCE`: Settings, UI layout layouts, or format parameters.
  * `PROJECT`: Metadata specific to content script titles/topics.
  * `BRAND`: Colors, tones, constraints, or styles.
  * `KNOWLEDGE`: Contextual documents and workspace assets.
* **`importance`** (1-10): Importance weighting of the memory block.
* **`source`**: The origin of the memory (e.g. `'user'`, `'agent'`, `'generation'`).
* **`confidence`** (0.0 - 1.0): Metric representing extract credibility.
* **`lastAccessed`** & **`accessCount`**: Counters to implement decay algorithms.
* **`expiresAt`**: Optional timestamp for temporary variables.
* **`embeddingVersion`**: Tracks prompt vectorizer versions for similarity calculations.
* **`relevanceScore`**: Similarity metric used to rank search outcomes.

---

## Search Strategies (`MemorySearchStrategy`)

The runtime query structures are prepared to support multiple retrieval models:
1. **`KEYWORD`**: Full-text regex or database match.
2. **`SEMANTIC`**: Vector similarity search (e.g., pgvector / cosine distance).
3. **`HYBRID`**: Combined keyword and semantic scores (e.g. RRF - Reciprocal Rank Fusion).

---

## Feature Flags Control (`memoryFeatureFlags`)

Operations are governed by three feature toggles in `config/featureFlags.ts`:
* `MEMORY_ENABLED`: Master switcher. If false, all memory operations are bypassed.
* `MEMORY_WRITE`: Activates `store()`, `update()`, and `delete()`.
* `MEMORY_READ`: Activates `retrieve()` and `search()`.

---

## Lifecycle Event Subscriptions

Developers can subscribe to memory mutations:
```typescript
import { MemoryRuntime, memoryProviderRegistry } from '@/ai/memory';

const memoryRuntime = new MemoryRuntime(memoryProviderRegistry);

// Register event observer
memoryRuntime.addListener((event) => {
  console.log(`Memory mutated: ${event.type} for record ${event.details.recordId}`);
});
```

---

## Extending the Runtime (pgvector Implementation Example)

Implementing a vector database provider is straightforward. Create a class implementing the `MemoryProvider` contract:

```typescript
import { MemoryProvider, MemoryRecord, MemoryQuery } from '@/ai/memory';

export class PgVectorMemoryProvider implements MemoryProvider {
  public name = 'PgVectorProvider';
  public version = '1.0.0';
  public supportedOperations = ['store', 'retrieve', 'update', 'delete', 'search'];

  public async store(record: MemoryRecord): Promise<void> {
    const embedding = await generateEmbedding(record.content);
    await db.query(
      'INSERT INTO memories (id, creator_id, content, embedding, tags, type, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [record.id, record.creatorId, record.content, embedding, record.tags, record.type, record.metadata]
    );
  }

  public async search(query: MemoryQuery): Promise<MemoryRecord[]> {
    const queryVector = await generateEmbedding(query.text);
    // Execute cosine similarity search
    const rows = await db.query(
      'SELECT *, (embedding <=> $1) as distance FROM memories WHERE creator_id = $2 ORDER BY distance LIMIT $3',
      [queryVector, query.creatorId, query.limit ?? 10]
    );
    return rows.map(row => ({
      ...row,
      relevanceScore: 1 - row.distance
    }));
  }

  // ... implement retrieve, update, and delete
}
```
Register the provider on start:
```typescript
import { memoryProviderRegistry } from '@/ai/memory';
import { PgVectorMemoryProvider } from './PgVectorMemoryProvider';

memoryProviderRegistry.register(new PgVectorMemoryProvider());
```
