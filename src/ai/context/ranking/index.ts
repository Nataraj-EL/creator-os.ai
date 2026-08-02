import { ContextBlock, ContextStrategy, ContextRankingStrategy } from '../types';

export class BalancedRankingStrategy implements ContextRankingStrategy {
  public name = ContextStrategy.BALANCED;
  
  public rank(blocks: ContextBlock[]): ContextBlock[] {
    const now = Date.now();
    const ranked = [...blocks].map(block => {
      const timeDiff = now - new Date(block.timestamp).getTime();
      const ageHours = Math.max(0, timeDiff) / (1000 * 60 * 60);
      const recencyScore = 1 / (1 + ageHours);

      const combinedScore = 0.4 * block.relevanceScore + 0.3 * (block.importance / 10) + 0.3 * recencyScore;
      
      return {
        ...block,
        selectionReason: `Balanced Rank Score: ${Math.round(combinedScore * 100)}% (Relevance: ${Math.round(block.relevanceScore * 100)}%, Importance: ${block.importance}/10, Recency: ${Math.round(recencyScore * 100)}%)`,
        metadata: { ...block.metadata, tempCombinedScore: combinedScore }
      };
    });

    return ranked.sort((a, b) => {
      const scoreA = a.metadata.tempCombinedScore;
      const scoreB = b.metadata.tempCombinedScore;
      return scoreB - scoreA;
    });
  }
}

export class RecencyFirstRankingStrategy implements ContextRankingStrategy {
  public name = ContextStrategy.RECENCY_FIRST;

  public rank(blocks: ContextBlock[]): ContextBlock[] {
    return [...blocks].map(block => ({
      ...block,
      selectionReason: `Recency First: timestamp ${block.timestamp}`
    })).sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });
  }
}

export class ImportanceFirstRankingStrategy implements ContextRankingStrategy {
  public name = ContextStrategy.IMPORTANCE_FIRST;

  public rank(blocks: ContextBlock[]): ContextBlock[] {
    return [...blocks].map(block => ({
      ...block,
      selectionReason: `Importance First: importance rating ${block.importance}/10`
    })).sort((a, b) => b.importance - a.importance);
  }
}

export class SemanticFirstRankingStrategy implements ContextRankingStrategy {
  public name = ContextStrategy.SEMANTIC_FIRST;

  public rank(blocks: ContextBlock[]): ContextBlock[] {
    return [...blocks].map(block => ({
      ...block,
      selectionReason: `Semantic First: similarity relevance score ${Math.round(block.relevanceScore * 100)}%`
    })).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
}

export class ContextRankingStrategyRegistry {
  private strategies = new Map<ContextStrategy, ContextRankingStrategy>();

  constructor() {
    this.register(new BalancedRankingStrategy());
    this.register(new RecencyFirstRankingStrategy());
    this.register(new ImportanceFirstRankingStrategy());
    this.register(new SemanticFirstRankingStrategy());
  }

  public register(strategy: ContextRankingStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  public get(name: ContextStrategy): ContextRankingStrategy | null {
    return this.strategies.get(name) || null;
  }

  public list(): ContextStrategy[] {
    return Array.from(this.strategies.keys());
  }
}

export const contextRankingStrategyRegistry = new ContextRankingStrategyRegistry();
