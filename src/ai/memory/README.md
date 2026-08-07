# AI Memory & RAG Runtime

Provides semantic vector memory persistence and retrieval interfaces scoped to multi-tenant user workspaces.

---

## Configuration

Feature flags (in `config/featureFlags.ts`):
*   `VECTOR_MEMORY`: Enables vector-database connections.
*   `PGVECTOR_RETRIEVAL`: Employs pgvector query executions.
*   `EMBEDDING_PROVIDER`: Selects the embedding vendor model (`'gemini'` or `'mock'`).

### Data Tables Schema
Create tables in Neon PostgreSQL using [schema.sql](file:///home/nataraj/Downloads/CreatorOS%20AI/src/ai/memory/storage/schema.sql):
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

If the database is unreachable or vector configs are omitted, the runtime falls back automatically to `LocalStorageMemoryRepository`.
