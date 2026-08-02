import { MemoryRepository, MemoryRecord, MemoryQuery } from '../types';

export class LocalStorageMemoryRepository implements MemoryRepository {
  private key = 'creatoros-memories';
  private static inMemoryFallback: MemoryRecord[] = [];

  private getRecords(): MemoryRecord[] {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return LocalStorageMemoryRepository.inMemoryFallback;
    }
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("[AI-MEM] Failed to retrieve from localStorage:", e);
      return [];
    }
  }

  private saveRecords(records: MemoryRecord[]): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      LocalStorageMemoryRepository.inMemoryFallback = records;
      return;
    }
    try {
      localStorage.setItem(this.key, JSON.stringify(records));
    } catch (e) {
      console.error("[AI-MEM] Failed to write to localStorage:", e);
    }
  }

  public clear(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      LocalStorageMemoryRepository.inMemoryFallback = [];
      return;
    }
    try {
      localStorage.removeItem(this.key);
    } catch (e) {
      console.error("[AI-MEM] Failed to clear localStorage:", e);
    }
  }

  public async save(record: MemoryRecord): Promise<void> {
    const records = this.getRecords();
    records.push(record);
    this.saveRecords(records);
  }

  public async findById(id: string): Promise<MemoryRecord | null> {
    const records = this.getRecords();
    return records.find(r => r.id === id) || null;
  }

  public async update(record: MemoryRecord): Promise<void> {
    const records = this.getRecords();
    const idx = records.findIndex(r => r.id === record.id);
    if (idx > -1) {
      records[idx] = record;
      this.saveRecords(records);
    }
  }

  public async deleteById(id: string): Promise<void> {
    const records = this.getRecords();
    const filtered = records.filter(r => r.id !== id);
    this.saveRecords(filtered);
  }

  public async query(query: MemoryQuery): Promise<MemoryRecord[]> {
    const records = this.getRecords();
    return records.filter(r => {
      // Filter by creator
      if (r.creatorId !== query.creatorId) return false;

      // Filter by tags (must contain all requested tags)
      if (query.tags && query.tags.length > 0) {
        if (!query.tags.every(t => r.tags.includes(t))) return false;
      }

      // Filter by text keyword (case-insensitive)
      if (query.text) {
        const queryLower = query.text.toLowerCase();
        const contentLower = r.content.toLowerCase();
        
        // Match if record content contains query text (for short queries)
        // OR match if the long query text contains the record tags (for prompt queries)
        const matchesContent = contentLower.includes(queryLower);
        const matchesTag = r.tags.some(t => queryLower.includes(t.toLowerCase()));
        
        if (!matchesContent && !matchesTag) return false;
      }

      // Filter by metadata if applicable
      if (query.metadataFilters) {
        for (const [key, val] of Object.entries(query.metadataFilters)) {
          if (r.metadata[key] !== val) return false;
        }
      }

      return true;
    }).slice(0, query.limit ?? 50);
  }
}
