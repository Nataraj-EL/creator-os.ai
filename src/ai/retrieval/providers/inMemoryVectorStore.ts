import { VectorStoreProvider, VectorStoreRecord } from '../types';

export class InMemoryVectorStore implements VectorStoreProvider {
  public name = 'InMemoryVectorStore';
  private records: Map<string, VectorStoreRecord> = new Map();

  public async store(record: VectorStoreRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  public async delete(id: string): Promise<void> {
    this.records.delete(id);
  }

  public async query(
    vector: number[], 
    topK: number, 
    filters?: Record<string, any>
  ): Promise<Array<{ record: VectorStoreRecord; similarity: number }>> {
    const matched: Array<{ record: VectorStoreRecord; similarity: number }> = [];

    for (const record of this.records.values()) {
      // Evaluate metadata filters
      let pass = true;
      if (filters) {
        for (const [key, val] of Object.entries(filters)) {
          if (record.metadata[key] !== val) {
            pass = false;
            break;
          }
        }
      }
      if (!pass) continue;

      const similarity = this.cosineSimilarity(vector, record.vector);
      matched.push({ record, similarity });
    }

    return matched
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0.0;
    
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dotProduct / denom : 0.0;
  }
}
