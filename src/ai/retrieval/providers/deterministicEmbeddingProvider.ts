import { EmbeddingProvider, EmbeddingResult } from '../types';

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  public name = 'DeterministicEmbeddingProvider';
  public version = '1.0.0';

  public async embed(text: string): Promise<EmbeddingResult> {
    const vector = [0.0, 0.0, 0.0, 0.0];
    const lower = text.toLowerCase();

    if (lower.includes('style')) vector[0] = 1.0;
    if (lower.includes('brand')) vector[1] = 1.0;
    if (lower.includes('preference')) vector[2] = 1.0;
    if (lower.includes('knowledge')) vector[3] = 1.0;

    // Normalize to unit vector
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1.0;
    const normalized = vector.map(v => v / magnitude);

    return {
      vector: normalized,
      dimension: 4,
      model: 'deterministic-4d',
      provider: this.name,
      embeddingVersion: this.version,
      metadata: { inputLength: text.length }
    };
  }
}
