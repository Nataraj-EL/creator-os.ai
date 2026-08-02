import { MemoryProvider, MemoryRecord, MemoryQuery, MemoryRepository } from '../types';

export class CreatorMemoryProvider implements MemoryProvider {
  public name = 'CreatorMemoryProvider';
  public version = '1.0.0';
  public supportedOperations = ['store', 'retrieve', 'update', 'delete', 'search'];
  private repository: MemoryRepository;

  constructor(repository: MemoryRepository) {
    this.repository = repository;
  }

  public async store(record: MemoryRecord): Promise<void> {
    await this.repository.save(record);
  }

  public async retrieve(id: string): Promise<MemoryRecord | null> {
    // Focus strictly on lookup; MemoryRuntime orchestrates metric updates
    return this.repository.findById(id);
  }

  public async update(record: MemoryRecord): Promise<void> {
    await this.repository.update(record);
  }

  public async delete(id: string): Promise<void> {
    await this.repository.deleteById(id);
  }

  public async search(query: MemoryQuery): Promise<MemoryRecord[]> {
    const records = await this.repository.query(query);

    // Flat relevance score assignment; Context Assembly Engine will handle ranking
    return records.map(record => {
      // FUTURE SEMANTIC SEARCH EXTENSION:
      // const embedding = await vectorService.embed(query.text);
      // const score = cosineSimilarity(embedding, record.embedding);
      
      return {
        ...record,
        relevanceScore: 1.0
      };
    });
  }
}
