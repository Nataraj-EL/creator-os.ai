import { 
  ContextAssemblyService, 
  ContextRequest, 
  ContextResult, 
  ContextBlock, 
  ContextStrategy, 
  ContextRankingStrategy, 
  ContextCompressor, 
  ContextLifecycleEvent, 
  ContextLifecycleListener,
  ContextLifecycleEventType
} from '../types';
import { MemoryService } from '../../memory/types';
import { ContextRankingStrategyRegistry } from '../ranking';
import { TokenBudgetCompressor } from '../compression';
import { contextFeatureFlags } from '../config/featureFlags';

export class ContextAssemblyRuntime implements ContextAssemblyService {
  private memoryService: MemoryService;
  private rankingRegistry: ContextRankingStrategyRegistry;
  private compressor: ContextCompressor;
  private listeners: Set<ContextLifecycleListener> = new Set();

  constructor(
    memoryService: MemoryService,
    rankingRegistry?: ContextRankingStrategyRegistry,
    compressor?: ContextCompressor
  ) {
    this.memoryService = memoryService;
    this.rankingRegistry = rankingRegistry || new ContextRankingStrategyRegistry();
    this.compressor = compressor || new TokenBudgetCompressor();
  }

  // Lifecycle listeners registry
  public addListener(listener: ContextLifecycleListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: ContextLifecycleListener): void {
    this.listeners.delete(listener);
  }

  private emitEvent(type: ContextLifecycleEventType, requestId: string, details: Record<string, any>): void {
    const event: ContextLifecycleEvent = {
      type,
      timestamp: new Date().toISOString(),
      requestId,
      details
    };

    console.log(`[${event.timestamp}] [AI-CTX] [${type}] request: ${requestId}, details: ${JSON.stringify(details)}`);

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error("[AI-CTX] Lifecycle event listener threw error:", e);
      }
    }
  }

  // Token estimate helper
  private estimateTokens(content: string): number {
    // Standard approximation: 1 token ~= 4 characters in English text
    return Math.ceil(content.length / 4);
  }

  // Primary assembly workflow
  public async assemble(request: ContextRequest): Promise<ContextResult> {
    const requestId = request.metadata?.requestId || `req-ctx-${Math.random().toString(36).substring(2, 9)}`;
    const targetBudget = request.tokenBudget || 2000;
    const selectedStrategy = request.strategy || ContextStrategy.BALANCED;

    this.emitEvent('ASSEMBLY_STARTED', requestId, { strategy: selectedStrategy, budget: targetBudget });

    // 1. Check master feature flag
    if (!contextFeatureFlags.CONTEXT_ENABLED) {
      console.warn("[AI-CTX] Assembly skipped: context assembler features disabled by feature flags.");
      const result: ContextResult = {
        requestId,
        blocks: [],
        totalTokens: 0,
        tokenBudget: targetBudget,
        strategy: selectedStrategy
      };
      this.emitEvent('ASSEMBLY_COMPLETED', requestId, { blocksCount: 0, totalTokens: 0 });
      return result;
    }

    // 2. Fetch memory blocks using MemoryService
    const memoryContext = {
      userId: request.userId,
      requestId,
      metadata: request.metadata
    };

    const memories = await this.memoryService.search(memoryContext, {
      text: request.prompt,
      tags: request.tags
    });

    this.emitEvent('RETRIEVAL_COMPLETED', requestId, { candidateRecordsCount: memories.length });

    // Convert memories to ContextBlock entities
    let blocks: ContextBlock[] = memories.map(record => ({
      id: record.id,
      content: record.content,
      source: 'memory',
      relevanceScore: record.relevanceScore ?? 0.5,
      importance: record.importance,
      timestamp: record.createdAt,
      tokenCount: this.estimateTokens(record.content),
      selectionReason: 'Candidate context block retrieved from long-term memory.',
      metadata: record.metadata || {}
    }));

    // 3. Deduplication filter (deduplicate identical contents or duplicate IDs)
    const seenIds = new Set<string>();
    const seenContent = new Set<string>();
    blocks = blocks.filter(block => {
      const normalizedContent = block.content.trim().toLowerCase();
      if (seenIds.has(block.id) || seenContent.has(normalizedContent)) {
        return false;
      }
      seenIds.add(block.id);
      seenContent.add(normalizedContent);
      return true;
    });

    // 4. Rank blocks based on strategies registry lookup
    if (contextFeatureFlags.CONTEXT_RANKING) {
      const rankStrategy = this.rankingRegistry.get(selectedStrategy);
      if (rankStrategy) {
        blocks = rankStrategy.rank(blocks);
      } else {
        console.warn(`[AI-CTX] Strategy [${selectedStrategy}] not registered in rankingRegistry. Defaulting to registry order.`);
      }
    }
    this.emitEvent('RANKING_COMPLETED', requestId, { rankedBlocksCount: blocks.length });

    // 5. Compress blocks inside budget limits
    if (contextFeatureFlags.CONTEXT_COMPRESSION) {
      blocks = await this.compressor.compress(blocks, targetBudget);
    }
    this.emitEvent('COMPRESSION_COMPLETED', requestId, { compressedBlocksCount: blocks.length });

    // Calculate metrics
    const totalTokens = blocks.reduce((sum, b) => sum + b.tokenCount, 0);

    const result: ContextResult = {
      requestId,
      blocks,
      totalTokens,
      tokenBudget: targetBudget,
      strategy: selectedStrategy
    };

    this.emitEvent('ASSEMBLY_COMPLETED', requestId, { blocksCount: blocks.length, totalTokens });
    return result;
  }
}
