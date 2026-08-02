# AI Memory Runtime & Persistent Provider (Sprint 8)

The AI Memory Runtime is a modular, strongly typed, and decoupled system for storing, retrieving, updating, deleting, and searching creator preferences, brand profiles, and conversational contexts.

---

## Technical Architecture

The memory runtime utilizes a pluggable provider registry, checks granular access control flags, resolves repository engines via factory DI, and broadcasts lifecycle triggers.

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
             ▼                           ▼
      [Provider Registry]         [Provider Registry]
      (CreatorMemoryProvider)     (CreatorMemoryProvider)
             │                           │
             ▼                           ▼
     [Repository Factory]        [Repository Factory]
  (LocalStorageMemoryRepository) (LocalStorageMemoryRepository)
             │                           │
             ▼                           ▼
    Emit STORE/UPDATE/DELETE     Emit RETRIEVE/SEARCH
      lifecycle events             lifecycle events
     (with recordId list)         (with retrievedIds list)
```

---

## Persistent Memory Provider (`CreatorMemoryProvider`)

The default provider `CreatorMemoryProvider` is implemented under `src/ai/memory/providers/`.
* **Persistence Focus**: The provider delegates all CRUD queries directly to the injected `MemoryRepository`.
* **Metric Updates**: On retrieval, the provider increments `accessCount` and updates the `lastAccessed` timestamp automatically in the repository.
* **Flat Scoring**: To ensure loose coupling, search results from the provider carry a flat relevance score of `1.0`. Multi-factor strategy sorting and relevance rankings are handled by the downstream **Context Assembly Engine**.
* **Trace Auditing**: Search operations emit logs and lifecycle event payloads containing `retrievedIds` metadata mapping, enabling end-to-end trace debugging.

---

## Repository Factory (`MemoryRepositoryFactory`)

To remain storage-agnostic, repositories are resolved using `MemoryRepositoryFactory.getRepository()`:
* **Default Adapter**: Resolves to `LocalStorageMemoryRepository`, persisting memory records as JSON in the browser's `localStorage`.
* **Test Environment Safety**: In Node.js server/test scopes where `localStorage` is missing, the repository falls back to a safe static in-memory array.
* **Database Swapping**: Future database engines (e.g. PostgreSQL, MongoDB) can be swapped in without modifying memory services by calling:
  `MemoryRepositoryFactory.registerRepository(new MyDatabaseMemoryRepository());`

---

## Future Vector Database Extension Guideline (pgvector / Pinecone)

To upgrade the keyword-based provider search to vector similarity matching:

1. **Implement Vector Provider**:
   Create a new class implementing the `MemoryProvider` contract.
2. **Embed Content**:
   Call an embeddings service to serialize content strings into vectors when storing records:
   ```typescript
   const embedding = await embedService.embed(record.content);
   ```
3. **Execute Cosine Similarity**:
   Perform similarity search queries against the database (e.g. pgvector or Pinecone):
   ```sql
   SELECT *, (embedding <=> $1) as distance 
   FROM memories 
   WHERE creator_id = $2 
   ORDER BY distance LIMIT 10
   ```
4. **Register Vector Provider**:
   ```typescript
   memoryProviderRegistry.register(new VectorMemoryProvider(repository));
   ```
