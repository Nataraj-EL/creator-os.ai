import { EvaluationRepository, EvaluationResult } from '../types';

export class LocalStorageEvaluationRepository implements EvaluationRepository {
  private key = 'creatoros-evaluations';

  private getRecords(): EvaluationResult[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Failed to parse evaluation records from localStorage:", e);
      return [];
    }
  }

  public async save(result: EvaluationResult): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const records = this.getRecords();
      const idx = records.findIndex(r => r.evaluationId === result.evaluationId);
      if (idx > -1) {
        records[idx] = result;
      } else {
        records.push(result);
      }
      localStorage.setItem(this.key, JSON.stringify(records));
    } catch (e) {
      console.error("Failed to save evaluation record to localStorage:", e);
      throw e;
    }
  }

  public async getById(id: string, tenantId: string, workspaceId: string): Promise<EvaluationResult | null> {
    const records = this.getRecords();
    return records.find(r => 
      r.evaluationId === id &&
      r.context.metadata?.tenantId === tenantId &&
      r.context.metadata?.workspaceId === workspaceId
    ) || null;
  }

  public async getByRequestId(requestId: string, tenantId: string, workspaceId: string): Promise<EvaluationResult[]> {
    const records = this.getRecords();
    return records.filter(r => 
      r.context.requestId === requestId &&
      r.context.metadata?.tenantId === tenantId &&
      r.context.metadata?.workspaceId === workspaceId
    );
  }

  public async listRecent(tenantId: string, workspaceId: string, limit: number = 20): Promise<EvaluationResult[]> {
    const records = this.getRecords();
    return records
      .filter(r => 
        r.context.metadata?.tenantId === tenantId &&
        r.context.metadata?.workspaceId === workspaceId
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  public async getAll(): Promise<EvaluationResult[]> {
    return this.getRecords();
  }

  public async clear(): Promise<void> {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.key);
  }
}
