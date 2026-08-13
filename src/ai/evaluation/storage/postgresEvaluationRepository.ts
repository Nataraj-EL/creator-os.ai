import pg from 'pg';
const { Pool } = pg;
import { EvaluationRepository, EvaluationResult, EvaluationStatus, EvaluationStage } from '../types';

export class InMemoryEvaluationRepository implements EvaluationRepository {
  private get records(): Map<string, EvaluationResult> {
    const g = global as any;
    if (!g._evaluationRecords) {
      g._evaluationRecords = new Map();
    }
    return g._evaluationRecords;
  }

  public async save(result: EvaluationResult): Promise<void> {
    const context = result.context || {};
    const metadata = context.metadata || {};
    const tenantId = metadata.tenantId;
    const workspaceId = metadata.workspaceId;
    if (!tenantId || tenantId === 'default' || !workspaceId || workspaceId === 'default') {
      throw new Error("Missing or unauthorized tenant/workspace context.");
    }
    this.records.set(result.evaluationId, result);
  }

  public async getById(id: string, tenantId: string, workspaceId: string): Promise<EvaluationResult | null> {
    if (!tenantId || tenantId === 'default' || !workspaceId || workspaceId === 'default') {
      throw new Error("Missing or unauthorized tenant/workspace context.");
    }
    const r = this.records.get(id);
    if (!r) return null;
    const context = r.context || {};
    const metadata = context.metadata || {};
    if (metadata.tenantId !== tenantId || metadata.workspaceId !== workspaceId) {
      return null;
    }
    return r;
  }

  public async getByRequestId(requestId: string, tenantId: string, workspaceId: string): Promise<EvaluationResult[]> {
    if (!tenantId || tenantId === 'default' || !workspaceId || workspaceId === 'default') {
      throw new Error("Missing or unauthorized tenant/workspace context.");
    }
    return Array.from(this.records.values()).filter(r => {
      const context = r.context || {};
      const metadata = context.metadata || {};
      return (
        context.requestId === requestId &&
        metadata.tenantId === tenantId &&
        metadata.workspaceId === workspaceId
      );
    });
  }

  public async listRecent(tenantId: string, workspaceId: string, limit: number = 20): Promise<EvaluationResult[]> {
    if (!tenantId || tenantId === 'default' || !workspaceId || workspaceId === 'default') {
      throw new Error("Missing or unauthorized tenant/workspace context.");
    }
    return Array.from(this.records.values())
      .filter(r => {
        const context = r.context || {};
        const metadata = context.metadata || {};
        return (
          metadata.tenantId === tenantId &&
          metadata.workspaceId === workspaceId
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  public async clear(): Promise<void> {
    this.records.clear();
  }
}

export class PostgresEvaluationRepository implements EvaluationRepository {
  private pool?: pg.Pool;
  private fallback?: InMemoryEvaluationRepository;
  private isInitialized = false;

  constructor(private connectionString: string) {}

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      if (!this.connectionString) {
        throw new Error("No database connection string configured.");
      }
      this.pool = new Pool({
        connectionString: this.connectionString,
        ssl: this.connectionString.includes('neon') ? { rejectUnauthorized: false } : undefined
      });
      await this.pool.query('SELECT 1');

      // Schema auto-creation (safe for local / dev)
      const schemaSql = `
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
        CREATE INDEX IF NOT EXISTS idx_evaluations_tenant_workspace 
        ON ai_evaluations (tenant_id, workspace_id, evaluation_id);
      `;
      await this.pool.query(schemaSql);
      this.isInitialized = true;
    } catch (err) {
      console.warn("[PostgresEvaluationRepository] Postgres connection failed. Using InMemory fallback:", err);
      this.fallback = new InMemoryEvaluationRepository();
      this.isInitialized = true;
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  public async save(result: EvaluationResult): Promise<void> {
    await this.ensureConnected();
    if (this.fallback) {
      return this.fallback.save(result);
    }

    const context = result.context || {};
    const metadata = context.metadata || {};
    const tenantId = metadata.tenantId;
    const workspaceId = metadata.workspaceId;
    if (!tenantId || tenantId === 'default' || !workspaceId || workspaceId === 'default') {
      throw new Error("Missing or unauthorized tenant/workspace context.");
    }

    try {
      const sql = `
        INSERT INTO ai_evaluations (
          evaluation_id, request_id, creator_id, stage, provider, model,
          overall_score, decision, latency_ms, metrics, metadata, tenant_id, workspace_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (evaluation_id) DO UPDATE SET
          overall_score = EXCLUDED.overall_score,
          decision = EXCLUDED.decision,
          metrics = EXCLUDED.metrics,
          metadata = EXCLUDED.metadata
      `;
      const values = [
        result.evaluationId,
        context.requestId || 'N/A',
        context.creatorId || 'default',
        context.stage || 'GENERATION',
        context.provider || 'Unknown',
        context.model || 'Unknown',
        result.overallScore,
        result.decision || 'PASS',
        result.latencyMs,
        JSON.stringify(result.metrics || []),
        JSON.stringify(metadata),
        tenantId,
        workspaceId,
        result.createdAt || new Date().toISOString()
      ];
      await this.pool!.query(sql, values);
    } catch (err) {
      console.error(`[PostgresEvaluationRepository] save failed:`, err);
      throw err;
    }
  }

  public async getById(id: string, tenantId: string, workspaceId: string): Promise<EvaluationResult | null> {
    await this.ensureConnected();
    if (this.fallback) {
      return this.fallback.getById(id, tenantId, workspaceId);
    }

    if (!tenantId || tenantId === 'default' || !workspaceId || workspaceId === 'default') {
      throw new Error("Missing or unauthorized tenant/workspace context.");
    }

    try {
      const sql = 'SELECT * FROM ai_evaluations WHERE evaluation_id = $1 AND tenant_id = $2 AND workspace_id = $3';
      const res = await this.pool!.query(sql, [id, tenantId, workspaceId]);
      if (res.rows.length === 0) return null;
      return this.mapRowToResult(res.rows[0]);
    } catch (err) {
      console.error(`[PostgresEvaluationRepository] getById failed for ${id}:`, err);
      throw err;
    }
  }

  public async getByRequestId(requestId: string, tenantId: string, workspaceId: string): Promise<EvaluationResult[]> {
    await this.ensureConnected();
    if (this.fallback) {
      return this.fallback.getByRequestId(requestId, tenantId, workspaceId);
    }

    if (!tenantId || tenantId === 'default' || !workspaceId || workspaceId === 'default') {
      throw new Error("Missing or unauthorized tenant/workspace context.");
    }

    try {
      const sql = 'SELECT * FROM ai_evaluations WHERE request_id = $1 AND tenant_id = $2 AND workspace_id = $3';
      const res = await this.pool!.query(sql, [requestId, tenantId, workspaceId]);
      return res.rows.map(row => this.mapRowToResult(row));
    } catch (err) {
      console.error(`[PostgresEvaluationRepository] getByRequestId failed for ${requestId}:`, err);
      throw err;
    }
  }

  public async listRecent(tenantId: string, workspaceId: string, limit: number = 20): Promise<EvaluationResult[]> {
    await this.ensureConnected();
    if (this.fallback) {
      return this.fallback.listRecent(tenantId, workspaceId, limit);
    }

    if (!tenantId || tenantId === 'default' || !workspaceId || workspaceId === 'default') {
      throw new Error("Missing or unauthorized tenant/workspace context.");
    }

    try {
      const sql = 'SELECT * FROM ai_evaluations WHERE tenant_id = $1 AND workspace_id = $2 ORDER BY created_at DESC LIMIT $3';
      const res = await this.pool!.query(sql, [tenantId, workspaceId, limit]);
      return res.rows.map(row => this.mapRowToResult(row));
    } catch (err) {
      console.error(`[PostgresEvaluationRepository] listRecent failed:`, err);
      throw err;
    }
  }

  public async clear(): Promise<void> {
    await this.ensureConnected();
    if (this.fallback) {
      await this.fallback.clear();
      return;
    }
    await this.pool!.query('DELETE FROM ai_evaluations');
  }

  private mapRowToResult(row: any): EvaluationResult {
    const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    return {
      evaluationId: row.evaluation_id,
      context: {
        requestId: row.request_id,
        creatorId: row.creator_id,
        stage: row.stage as EvaluationStage,
        provider: row.provider,
        model: row.model,
        metadata
      },
      status: EvaluationStatus.COMPLETED,
      metrics: typeof row.metrics === 'string' ? JSON.parse(row.metrics) : row.metrics,
      overallScore: row.overall_score,
      decision: row.decision,
      latencyMs: row.latency_ms,
      createdAt: new Date(row.created_at).toISOString()
    };
  }
}
