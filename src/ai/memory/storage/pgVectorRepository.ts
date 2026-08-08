import pg from 'pg';
const { Pool } = pg;
import { MemoryRepository, MemoryRecord, MemoryQuery, MemoryType } from '../types';
import { EmbeddingProvider } from '../embeddings';
import { LocalStorageMemoryRepository } from './localStorageRepository';

export class PgVectorMemoryRepository implements MemoryRepository {
  private pool: pg.Pool;
  private fallback: LocalStorageMemoryRepository;

  constructor(
    connectionString: string,
    private embeddingProvider: EmbeddingProvider
  ) {
    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes('neon') ? { rejectUnauthorized: false } : undefined
    });
    this.fallback = new LocalStorageMemoryRepository();
  }

  public async save(record: MemoryRecord): Promise<void> {
    try {
      const vector = await this.embeddingProvider.embed(record.content);
      const vectorStr = `[${vector.join(',')}]`;

      const tenantId = record.metadata?.tenantId;
      const workspaceId = record.metadata?.workspaceId;

      if (!tenantId || tenantId === 'default' || !workspaceId || workspaceId === 'default') {
        throw new Error("Missing or unauthorized tenant/workspace context in memory record metadata.");
      }

      const sql = `
        INSERT INTO ai_memories (
          id, creator_id, tenant_id, workspace_id, content, tags, type,
          importance, confidence, source, last_accessed, access_count,
          expires_at, embedding, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `;

      const values = [
        record.id,
        record.creatorId,
        tenantId,
        workspaceId,
        record.content,
        record.tags,
        record.type,
        record.importance,
        record.confidence,
        record.source,
        record.lastAccessed,
        record.accessCount,
        record.expiresAt || null,
        vectorStr,
        JSON.stringify(record.metadata),
        record.createdAt,
        record.updatedAt
      ];

      await this.pool.query(sql, values);
    } catch (err) {
      console.error("[PgVectorMemoryRepository] save query failed, routing to local fallback:", err);
      await this.fallback.save(record);
    }
  }

  public async findById(id: string): Promise<MemoryRecord | null> {
    try {
      const res = await this.pool.query('SELECT * FROM ai_memories WHERE id = $1', [id]);
      if (res.rows.length === 0) {
        return null;
      }
      return this.mapRowToRecord(res.rows[0]);
    } catch (err) {
      console.error("[PgVectorMemoryRepository] findById query failed, routing to local fallback:", err);
      return this.fallback.findById(id);
    }
  }

  public async update(record: MemoryRecord): Promise<void> {
    try {
      const vector = await this.embeddingProvider.embed(record.content);
      const vectorStr = `[${vector.join(',')}]`;

      const tenantId = record.metadata?.tenantId;
      const workspaceId = record.metadata?.workspaceId;

      if (!tenantId || tenantId === 'default' || !workspaceId || workspaceId === 'default') {
        throw new Error("Missing or unauthorized tenant/workspace context in memory record metadata.");
      }

      const sql = `
        UPDATE ai_memories SET
          creator_id = $2,
          tenant_id = $3,
          workspace_id = $4,
          content = $5,
          tags = $6,
          type = $7,
          importance = $8,
          confidence = $9,
          source = $10,
          last_accessed = $11,
          access_count = $12,
          expires_at = $13,
          embedding = $14,
          metadata = $15,
          updated_at = $16
        WHERE id = $1
      `;

      const values = [
        record.id,
        record.creatorId,
        tenantId,
        workspaceId,
        record.content,
        record.tags,
        record.type,
        record.importance,
        record.confidence,
        record.source,
        record.lastAccessed,
        record.accessCount,
        record.expiresAt || null,
        vectorStr,
        JSON.stringify(record.metadata),
        record.updatedAt
      ];

      await this.pool.query(sql, values);
    } catch (err) {
      console.error("[PgVectorMemoryRepository] update query failed, routing to local fallback:", err);
      await this.fallback.update(record);
    }
  }

  public async deleteById(id: string): Promise<void> {
    try {
      await this.pool.query('DELETE FROM ai_memories WHERE id = $1', [id]);
    } catch (err) {
      console.error("[PgVectorMemoryRepository] deleteById query failed, routing to local fallback:", err);
      await this.fallback.deleteById(id);
    }
  }

  public async query(query: MemoryQuery): Promise<MemoryRecord[]> {
    try {
      const tenantId = query.metadataFilters?.tenantId;
      const workspaceId = query.metadataFilters?.workspaceId;
      
      if (!tenantId || tenantId === 'default' || !workspaceId || workspaceId === 'default') {
        throw new Error("Missing or unauthorized tenant/workspace context in memory query.");
      }
      const limit = query.limit || 10;

      let sql = '';
      let values: any[] = [];

      if (query.text) {
        const vector = await this.embeddingProvider.embed(query.text);
        const vectorStr = `[${vector.join(',')}]`;

        sql = `
          SELECT *, (1 - (embedding <=> $1)) as similarity
          FROM ai_memories
          WHERE tenant_id = $2
            AND workspace_id = $3
            AND creator_id = $4
        `;
        values = [vectorStr, tenantId, workspaceId, query.creatorId];

        if (query.tags && query.tags.length > 0) {
          sql += ` AND tags && $5`;
          values.push(query.tags);
        }

        sql += ` ORDER BY similarity DESC LIMIT $${values.length + 1}`;
        values.push(limit);

      } else {
        sql = `
          SELECT *, 1.0 as similarity
          FROM ai_memories
          WHERE tenant_id = $1
            AND workspace_id = $2
            AND creator_id = $3
        `;
        values = [tenantId, workspaceId, query.creatorId];

        if (query.tags && query.tags.length > 0) {
          sql += ` AND tags && $4`;
          values.push(query.tags);
        }

        sql += ` LIMIT $${values.length + 1}`;
        values.push(limit);
      }

      const res = await this.pool.query(sql, values);
      return res.rows.map(row => {
        const record = this.mapRowToRecord(row);
        record.relevanceScore = row.similarity !== undefined ? Number(row.similarity) : 1.0;
        return record;
      });
    } catch (err) {
      console.error("[PgVectorMemoryRepository] query execution failed, routing to local fallback:", err);
      return this.fallback.query(query);
    }
  }

  public async clear(): Promise<void> {
    try {
      await this.pool.query("DELETE FROM ai_memories WHERE workspace_id = 'default'");
    } catch (err) {
      console.error("[PgVectorMemoryRepository] clear query failed, routing to local fallback:", err);
      this.fallback.clear();
    }
  }

  public async dispose(): Promise<void> {
    try {
      await this.pool.end();
    } catch (err) {
      // fail-open
    }
  }

  private mapRowToRecord(row: any): MemoryRecord {
    return {
      id: row.id,
      creatorId: row.creator_id,
      content: row.content,
      tags: row.tags || [],
      type: row.type as MemoryType,
      importance: Number(row.importance ?? 5),
      confidence: Number(row.confidence ?? 1.0),
      source: row.source || 'user',
      lastAccessed: row.last_accessed ? new Date(row.last_accessed).toISOString() : new Date().toISOString(),
      accessCount: Number(row.access_count ?? 0),
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : undefined,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
    };
  }
}
