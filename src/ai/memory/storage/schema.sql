-- Migration Script: Production pgvector Schema Setup

-- 1. Enable the pgvector extension (requires superuser / database owner privileges)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create the memories table structure with configurable model dimension dimensions
CREATE TABLE IF NOT EXISTS ai_memories (
    id VARCHAR(255) PRIMARY KEY,
    creator_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    workspace_id VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    embedding VECTOR(768), -- Default to 768 for Gemini, support 1536 for OpenAI if configured
    metadata JSONB NOT NULL DEFAULT '{}',
    relevance_score DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create HNSW similarity search indexes on the vector embeddings column
CREATE INDEX IF NOT EXISTS ai_memories_embedding_idx ON ai_memories USING hnsw (embedding vector_cosine_ops);

-- 4. Create secondary helper indexing for workspace/creator queries filtering
CREATE INDEX IF NOT EXISTS ai_memories_workspace_idx ON ai_memories(workspace_id);
CREATE INDEX IF NOT EXISTS ai_memories_creator_idx ON ai_memories(creator_id);
