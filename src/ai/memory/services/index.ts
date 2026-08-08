import { 
  MemoryService, 
  MemoryContext, 
  MemoryType, 
  MemoryRecord, 
  MemoryQuery, 
  MemoryRepository, 
  MemoryLifecycleEvent, 
  MemoryLifecycleListener,
  MemoryLifecycleEventType
} from '../types';
import { MemoryProviderRegistry } from '../providers';
import { memoryFeatureFlags } from '../config/featureFlags';
import { traceEventBus } from '../../observability';

export class MemoryRuntime implements MemoryService {
  private registry: MemoryProviderRegistry;
  private repository?: MemoryRepository;
  private listeners: Set<MemoryLifecycleListener> = new Set();

  constructor(registry: MemoryProviderRegistry, repository?: MemoryRepository) {
    this.registry = registry;
    this.repository = repository;
  }

  public addListener(listener: MemoryLifecycleListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: MemoryLifecycleListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(type: MemoryLifecycleEventType, context: MemoryContext, details: Record<string, any>): void {
    const event: MemoryLifecycleEvent = {
      type,
      timestamp: new Date().toISOString(),
      context,
      details
    };
    
    console.log(`[${event.timestamp}] [AI-MEM] [${type}] context: ${JSON.stringify(context)}, details: ${JSON.stringify(details)}`);

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error("[AI-MEM] Lifecycle event listener threw error:", e);
      }
    }
  }

  private validateContext(context: MemoryContext) {
    const tenantId = context.metadata?.tenantId;
    const workspaceId = context.metadata?.workspaceId;
    if (!tenantId || tenantId === 'default' || !workspaceId || workspaceId === 'default') {
      throw new Error("Missing or unauthorized tenant/workspace context in memory operation.");
    }
    return { tenantId, workspaceId };
  }

  // 1. Store memory record
  public async store(
    context: MemoryContext, 
    content: string, 
    tags: string[], 
    type: MemoryType, 
    options?: { 
      id?: string;
      importance?: number; 
      source?: string; 
      confidence?: number; 
      expiresAt?: string; 
      metadata?: Record<string, any>;
    }
  ): Promise<MemoryRecord | null> {
    const { tenantId, workspaceId } = this.validateContext(context);

    traceEventBus.publish({
      traceId: context.sessionId || '',
      requestId: context.requestId || '',
      stage: 'memory-runtime',
      component: 'MemoryRuntime',
      status: 'started',
      metadata: { operation: 'store', type }
    });

    if (!memoryFeatureFlags.MEMORY_ENABLED || !memoryFeatureFlags.MEMORY_WRITE) {
      console.warn("[AI-MEM] Store skipped: Memory write features disabled by feature flags.");
      traceEventBus.publish({
        traceId: context.sessionId || '',
        requestId: context.requestId || '',
        stage: 'memory-runtime',
        component: 'MemoryRuntime',
        status: 'failed',
        metadata: { reason: 'Disabled by feature flags.' }
      });
      return null;
    }

    const timestamp = new Date().toISOString();
    const record: MemoryRecord = {
      id: options?.id || `mem-${Math.random().toString(36).substring(2, 9)}`,
      creatorId: context.userId,
      content,
      tags,
      type,
      importance: options?.importance ?? 5,
      source: options?.source ?? 'user',
      confidence: options?.confidence ?? 1.0,
      lastAccessed: timestamp,
      accessCount: 0,
      expiresAt: options?.expiresAt,
      metadata: {
        ...options?.metadata,
        tenantId,
        workspaceId
      },
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const provider = this.registry.defaultProvider();
    if (provider) {
      await provider.store(record);
    }

    if (this.repository) {
      await this.repository.save(record);
    }

    this.emitEvent('STORE', context, { recordId: record.id, type, tagsCount: tags.length });

    traceEventBus.publish({
      traceId: context.sessionId || '',
      requestId: context.requestId || '',
      stage: 'memory-runtime',
      component: 'MemoryRuntime',
      status: 'completed',
      metadata: { operation: 'store', type, recordId: record.id }
    });

    return record;
  }

  // 2. Retrieve single memory record
  public async retrieve(context: MemoryContext, id: string): Promise<MemoryRecord | null> {
    const { tenantId, workspaceId } = this.validateContext(context);

    if (!memoryFeatureFlags.MEMORY_ENABLED || !memoryFeatureFlags.MEMORY_READ) {
      console.warn("[AI-MEM] Retrieve skipped: Memory read features disabled by feature flags.");
      return null;
    }

    let record: MemoryRecord | null = null;

    const provider = this.registry.defaultProvider();
    if (provider) {
      record = await provider.retrieve(id);
    }

    if (!record && this.repository) {
      record = await this.repository.findById(id);
    }

    if (record) {
      // Validate context limits to block cross-tenant lookups
      const recordTenant = record.metadata?.tenantId || (record as any).tenantId || 'default';
      const recordWorkspace = record.metadata?.workspaceId || (record as any).workspaceId || 'default';
      if (recordTenant !== tenantId || recordWorkspace !== workspaceId) {
        return null;
      }

      record.accessCount += 1;
      record.lastAccessed = new Date().toISOString();

      if (provider) {
        await provider.update(record);
      }
      if (this.repository) {
        await this.repository.update(record);
      }
    }

    this.emitEvent('RETRIEVE', context, { recordId: id, found: !!record });
    return record;
  }

  // 3. Update memory record
  public async update(
    context: MemoryContext, 
    id: string, 
    updates: Partial<Pick<MemoryRecord, 'content' | 'tags' | 'importance' | 'confidence' | 'metadata'>>
  ): Promise<MemoryRecord | null> {
    this.validateContext(context);

    if (!memoryFeatureFlags.MEMORY_ENABLED || !memoryFeatureFlags.MEMORY_WRITE) {
      console.warn("[AI-MEM] Update skipped: Memory write features disabled by feature flags.");
      return null;
    }

    let record = await this.retrieve(context, id);
    if (!record) {
      return null;
    }

    if (updates.content !== undefined) record.content = updates.content;
    if (updates.tags !== undefined) record.tags = updates.tags;
    if (updates.importance !== undefined) record.importance = updates.importance;
    if (updates.confidence !== undefined) record.confidence = updates.confidence;
    if (updates.metadata !== undefined) record.metadata = { ...record.metadata, ...updates.metadata };
    
    record.updatedAt = new Date().toISOString();

    const provider = this.registry.defaultProvider();
    if (provider) {
      await provider.update(record);
    }
    if (this.repository) {
      await this.repository.update(record);
    }

    this.emitEvent('UPDATE', context, { recordId: id });
    return record;
  }

  // 4. Delete memory record
  public async delete(context: MemoryContext, id: string): Promise<boolean> {
    this.validateContext(context);

    if (!memoryFeatureFlags.MEMORY_ENABLED || !memoryFeatureFlags.MEMORY_WRITE) {
      console.warn("[AI-MEM] Delete skipped: Memory write features disabled by feature flags.");
      return false;
    }

    // Verify context matches before deletion
    const record = await this.retrieve(context, id);
    if (!record) {
      return false;
    }

    const provider = this.registry.defaultProvider();
    if (provider) {
      await provider.delete(id);
    }

    if (this.repository) {
      await this.repository.deleteById(id);
    }

    this.emitEvent('DELETE', context, { recordId: id });
    return true;
  }

  // 5. Search memories
  public async search(context: MemoryContext, query: Omit<MemoryQuery, 'creatorId'>): Promise<MemoryRecord[]> {
    const { tenantId, workspaceId } = this.validateContext(context);

    traceEventBus.publish({
      traceId: context.sessionId || '',
      requestId: context.requestId || '',
      stage: 'memory-runtime',
      component: 'MemoryRuntime',
      status: 'started',
      metadata: { operation: 'search', queryText: query.text }
    });

    if (!memoryFeatureFlags.MEMORY_ENABLED || !memoryFeatureFlags.MEMORY_READ) {
      console.warn("[AI-MEM] Search skipped: Memory read features disabled by feature flags.");
      traceEventBus.publish({
        traceId: context.sessionId || '',
        requestId: context.requestId || '',
        stage: 'memory-runtime',
        component: 'MemoryRuntime',
        status: 'completed',
        metadata: { operation: 'search', resultsCount: 0 }
      });
      return [];
    }

    const fullQuery: MemoryQuery = {
      ...query,
      creatorId: context.userId,
      metadataFilters: {
        ...query.metadataFilters,
        tenantId,
        workspaceId
      }
    };

    let results: MemoryRecord[] = [];

    const provider = this.registry.defaultProvider();
    if (provider) {
      results = await provider.search(fullQuery);
    } else if (this.repository) {
      results = await this.repository.query(fullQuery);
    }

    const rankedResults = [...results].sort((a, b) => {
      const scoreA = a.relevanceScore ?? 0;
      const scoreB = b.relevanceScore ?? 0;
      return scoreB - scoreA;
    });

    this.emitEvent('SEARCH', context, { 
      queryText: query.text, 
      tagsCount: query.tags?.length || 0,
      resultsCount: rankedResults.length,
      retrievedIds: rankedResults.map(r => r.id)
    });

    traceEventBus.publish({
      traceId: context.sessionId || '',
      requestId: context.requestId || '',
      stage: 'memory-runtime',
      component: 'MemoryRuntime',
      status: 'completed',
      metadata: { operation: 'search', resultsCount: rankedResults.length }
    });

    return rankedResults;
  }
}
