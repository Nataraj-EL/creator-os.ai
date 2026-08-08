-- Create workflow executions table for durable execution persistence
CREATE TABLE IF NOT EXISTS workflow_executions (
    execution_id VARCHAR(255) PRIMARY KEY,
    workflow_id VARCHAR(255) NOT NULL,
    workflow_version VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED')),
    current_step_id VARCHAR(255) NOT NULL,
    variables JSONB NOT NULL DEFAULT '{}',
    completed_steps JSONB NOT NULL DEFAULT '{}',
    errors JSONB NOT NULL DEFAULT '{}',
    tenant_id VARCHAR(255) NOT NULL DEFAULT 'default',
    workspace_id VARCHAR(255) NOT NULL DEFAULT 'default',
    creator_id VARCHAR(255) NOT NULL DEFAULT 'default',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    heartbeat_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for tenant and workspace scoped searches
CREATE INDEX IF NOT EXISTS idx_workflow_exec_tenant_workspace 
ON workflow_executions (tenant_id, workspace_id, execution_id);
