-- Create AI evaluations table for metrics history and regression tracking
CREATE TABLE IF NOT EXISTS ai_evaluations (
    evaluation_id VARCHAR(255) PRIMARY KEY,
    request_id VARCHAR(255) NOT NULL,
    creator_id VARCHAR(255) NOT NULL DEFAULT 'default',
    stage VARCHAR(50) NOT NULL,
    provider VARCHAR(255) NOT NULL,
    model VARCHAR(255) NOT NULL,
    overall_score INTEGER NOT NULL,
    decision VARCHAR(50) NOT NULL,
    latency_ms INTEGER NOT NULL,
    metrics JSONB NOT NULL DEFAULT '[]',
    metadata JSONB NOT NULL DEFAULT '{}',
    tenant_id VARCHAR(255) NOT NULL DEFAULT 'default',
    workspace_id VARCHAR(255) NOT NULL DEFAULT 'default',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for tenant and workspace scoped searches
CREATE INDEX IF NOT EXISTS idx_evaluations_tenant_workspace 
ON ai_evaluations (tenant_id, workspace_id, evaluation_id);
