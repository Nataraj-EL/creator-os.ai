import { ContextBlock, ContextCompressor } from '../types';

export class TokenBudgetCompressor implements ContextCompressor {
  public name = 'TokenBudgetCompressor';

  public compress(blocks: ContextBlock[], budget: number): ContextBlock[] {
    const compressed: ContextBlock[] = [];
    let accumulatedTokens = 0;

    for (const block of blocks) {
      // Keep blocks that fit within the token budget
      if (accumulatedTokens + block.tokenCount <= budget) {
        compressed.push(block);
        accumulatedTokens += block.tokenCount;
      }
      // If a block exceeds the budget, it is omitted
    }

    return compressed;
  }
}
