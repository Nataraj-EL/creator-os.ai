import { 
  EmbeddingResult, 
  EmbeddingProvider, 
  VectorStoreProvider, 
  RetrievalResult, 
  RetrievalQuery, 
  HybridRankingStrategy, 
  RetrievalLifecycleEvent, 
  RetrievalLifecycleListener,
  RetrievalLifecycleEventType,
  RetrievalSearchService
} from '../types';
import { retrievalProviderRegistry, vectorStoreRegistry } from '../providers/registry';
import { retrievalFeatureFlags } from '../config/featureFlags';
import { traceEventBus } from '../../observability';

export class EmbeddingService {
  private listeners: Set<RetrievalLifecycleListener> = new Set();

  public addListener(listener: RetrievalLifecycleListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: RetrievalLifecycleListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(type: RetrievalLifecycleEventType, details: Record<string, any>): void {
    const event: RetrievalLifecycleEvent = {
      type,
      timestamp: new Date().toISOString(),
      details
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error("[AI-RETRIEVE] Event listener threw error:", e);
      }
    }
  }

  public async generateEmbeddings(text: string): Promise<EmbeddingResult> {
    this.emitEvent('EMBEDDING_STARTED', { textLength: text.length });

    if (!retrievalFeatureFlags.EMBEDDINGS_ENABLED) {
      throw new Error("Embedding skipped: Embeddings features disabled by feature flags.");
    }

    const provider = retrievalProviderRegistry.getProvider();
    if (!provider) {
      throw new Error("No default Embedding provider registered.");
    }

    const result = await provider.embed(text);
    
    this.emitEvent('EMBEDDING_COMPLETED', { 
      provider: result.provider, 
      dimension: result.dimension, 
      model: result.model 
    });

    return result;
  }
}

export class WeightedHybridStrategy implements HybridRankingStrategy {
  public name = 'WeightedHybridStrategy';
  private semanticWeight: number;
  private keywordWeight: number;

  constructor(semanticWeight: number = 0.5, keywordWeight: number = 0.5) {
    this.semanticWeight = semanticWeight;
    this.keywordWeight = keywordWeight;
  }

  public combine(semanticScore: number, keywordScore: number): number {
    return (this.semanticWeight * semanticScore) + (this.keywordWeight * keywordScore);
  }
}

export class RetrievalService implements RetrievalSearchService {
  private embeddingService: EmbeddingService;
  private listeners: Set<RetrievalLifecycleListener> = new Set();

  constructor(embeddingService?: EmbeddingService) {
    this.embeddingService = embeddingService || new EmbeddingService();
    // Proxy events from embedding service to retrieval service listeners
    this.embeddingService.addListener((evt) => this.emitEvent(evt.type, evt.details));
  }

  public addListener(listener: RetrievalLifecycleListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: RetrievalLifecycleListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(type: RetrievalLifecycleEventType, details: Record<string, any>): void {
    const event: RetrievalLifecycleEvent = {
      type,
      timestamp: new Date().toISOString(),
      details
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error("[AI-RETRIEVE] Event listener threw error:", e);
      }
    }
  }

  public async semanticSearch(query: RetrievalQuery): Promise<RetrievalResult[]> {
    traceEventBus.publish({
      traceId: query.metadataFilters?.traceId || '',
      requestId: query.metadataFilters?.requestId || '',
      stage: 'retrieval',
      component: 'RetrievalService',
      status: 'started',
      metadata: { textLength: query.text.length, topK: query.topK }
    });

    const startTime = Date.now();
    this.emitEvent('SEARCH_STARTED', { text: query.text, mode: 'semantic' });

    if (!retrievalFeatureFlags.SEMANTIC_RETRIEVAL) {
      console.warn("[AI-RETRIEVE] Semantic search skipped: disabled by feature flags.");
      this.emitEvent('SEARCH_COMPLETED', { mode: 'semantic', resultsCount: 0 });
      traceEventBus.publish({
        traceId: query.metadataFilters?.traceId || '',
        requestId: query.metadataFilters?.requestId || '',
        stage: 'retrieval',
        component: 'RetrievalService',
        status: 'completed',
        metadata: { mode: 'semantic', resultsCount: 0, reason: 'Disabled by feature flags.' }
      });
      return [];
    }

    const store = vectorStoreRegistry.getStore();
    if (!store) {
      throw new Error("No default Vector Store registered.");
    }

    const embeddingResult = await this.embeddingService.generateEmbeddings(query.text);
    const topK = query.topK || 10;

    // Apply creatorId filter alongside query metadata filters
    const filters = {
      creatorId: query.creatorId,
      ...query.metadataFilters
    };

    const hits = await store.query(embeddingResult.vector, topK, filters);
    const latency = Date.now() - startTime;

    const results: RetrievalResult[] = hits.map(hit => {
      const memoryRecord = hit.record.metadata.memoryRecord || {
        id: hit.record.id,
        content: hit.record.metadata.content || '',
        creatorId: hit.record.metadata.creatorId || query.creatorId,
        type: hit.record.metadata.type || 'brand',
        tags: hit.record.metadata.tags || [],
        importance: hit.record.metadata.importance ?? 5,
        confidence: hit.record.metadata.confidence ?? 1.0,
        lastAccessed: hit.record.metadata.lastAccessed || new Date().toISOString(),
        accessCount: hit.record.metadata.accessCount ?? 0,
        createdAt: hit.record.metadata.createdAt || new Date().toISOString(),
        updatedAt: hit.record.metadata.updatedAt || new Date().toISOString(),
        metadata: hit.record.metadata
      };

      return {
        memoryId: hit.record.id,
        similarityScore: hit.similarity,
        keywordScore: 0.0,
        finalScore: hit.similarity,
        retrievalReason: 'Retrieved via semantic cosine matching.',
        metadata: {
          provider: store.name,
          strategy: 'semantic',
          embeddingVersion: embeddingResult.embeddingVersion,
          latency,
          reason: `Matched via model ${embeddingResult.model}.`
        },
        memoryRecord
      };
    });

    this.emitEvent('SEARCH_COMPLETED', { mode: 'semantic', resultsCount: results.length, latency });

    traceEventBus.publish({
      traceId: query.metadataFilters?.traceId || '',
      requestId: query.metadataFilters?.requestId || '',
      stage: 'retrieval',
      component: 'RetrievalService',
      status: 'completed',
      metadata: { mode: 'semantic', resultsCount: results.length }
    });

    return results;
  }

  public async hybridSearch(query: RetrievalQuery, strategy?: HybridRankingStrategy): Promise<RetrievalResult[]> {
    traceEventBus.publish({
      traceId: query.metadataFilters?.traceId || '',
      requestId: query.metadataFilters?.requestId || '',
      stage: 'retrieval',
      component: 'RetrievalService',
      status: 'started',
      metadata: { textLength: query.text.length, topK: query.topK }
    });

    const startTime = Date.now();
    this.emitEvent('SEARCH_STARTED', { text: query.text, mode: 'hybrid' });

    if (!retrievalFeatureFlags.HYBRID_RETRIEVAL) {
      console.warn("[AI-RETRIEVE] Hybrid search skipped: disabled by feature flags.");
      this.emitEvent('SEARCH_COMPLETED', { mode: 'hybrid', resultsCount: 0 });
      traceEventBus.publish({
        traceId: query.metadataFilters?.traceId || '',
        requestId: query.metadataFilters?.requestId || '',
        stage: 'retrieval',
        component: 'RetrievalService',
        status: 'completed',
        metadata: { mode: 'hybrid', resultsCount: 0, reason: 'Disabled by feature flags.' }
      });
      return [];
    }

    const store = vectorStoreRegistry.getStore();
    if (!store) {
      throw new Error("No default Vector Store registered.");
    }

    const activeStrategy = strategy || new WeightedHybridStrategy(0.5, 0.5);
    const embeddingResult = await this.embeddingService.generateEmbeddings(query.text);
    const topK = query.topK || 10;

    const filters = {
      creatorId: query.creatorId,
      ...query.metadataFilters
    };

    const hits = await store.query(embeddingResult.vector, topK, filters);
    const latency = Date.now() - startTime;

    const results: RetrievalResult[] = hits.map(hit => {
      // Simple keyword heuristic logic matching query text keywords against stored metadata content
      let keywordScore = 0.0;
      const recordText = hit.record.metadata.content || '';
      const lowerQuery = query.text.toLowerCase();
      
      if (recordText.toLowerCase().includes(lowerQuery)) {
        keywordScore = 1.0;
      } else {
        // Tag overlaps
        const queryWords = lowerQuery.split(/\s+/);
        const match = queryWords.some(word => word && recordText.toLowerCase().includes(word));
        if (match) keywordScore = 0.5;
      }

      const finalScore = activeStrategy.combine(hit.similarity, keywordScore);

      const memoryRecord = hit.record.metadata.memoryRecord || {
        id: hit.record.id,
        content: hit.record.metadata.content || '',
        creatorId: hit.record.metadata.creatorId || query.creatorId,
        type: hit.record.metadata.type || 'brand',
        tags: hit.record.metadata.tags || [],
        importance: hit.record.metadata.importance ?? 5,
        confidence: hit.record.metadata.confidence ?? 1.0,
        lastAccessed: hit.record.metadata.lastAccessed || new Date().toISOString(),
        accessCount: hit.record.metadata.accessCount ?? 0,
        createdAt: hit.record.metadata.createdAt || new Date().toISOString(),
        updatedAt: hit.record.metadata.updatedAt || new Date().toISOString(),
        metadata: hit.record.metadata
      };

      return {
        memoryId: hit.record.id,
        similarityScore: hit.similarity,
        keywordScore,
        finalScore,
        retrievalReason: `Retrieved via hybrid ranking strategy: ${activeStrategy.name}.`,
        metadata: {
          provider: store.name,
          strategy: `hybrid (${activeStrategy.name})`,
          embeddingVersion: embeddingResult.embeddingVersion,
          latency,
          reason: `Combined score resolved via ${activeStrategy.name}.`
        },
        memoryRecord
      };
    });

    // Re-rank based on combined finalScore
    results.sort((a, b) => b.finalScore - a.finalScore);

    const sliced = results.slice(0, topK);

    this.emitEvent('SEARCH_COMPLETED', { mode: 'hybrid', resultsCount: sliced.length, latency });

    traceEventBus.publish({
      traceId: query.metadataFilters?.traceId || '',
      requestId: query.metadataFilters?.requestId || '',
      stage: 'retrieval',
      component: 'RetrievalService',
      status: 'completed',
      metadata: { mode: 'hybrid', resultsCount: sliced.length }
    });

    return sliced;
  }
}
