export interface ChunkingStrategy {
  chunk(text: string): string[];
}

export class WordChunkingStrategy implements ChunkingStrategy {
  public chunk(text: string): string[] {
    if (!text) return [];
    const tokens = text.split(/(\s+)/);
    return tokens.filter(t => t.length > 0);
  }
}

export class SentenceChunkingStrategy implements ChunkingStrategy {
  public chunk(text: string): string[] {
    if (!text) return [];
    const segments = text.split(/([.!?]\s*)/);
    const chunks: string[] = [];
    for (let i = 0; i < segments.length; i += 2) {
      const sentence = segments[i] || '';
      const punctuation = segments[i + 1] || '';
      if (sentence || punctuation) {
        chunks.push(sentence + punctuation);
      }
    }
    return chunks.filter(c => c.length > 0);
  }
}

export class FixedSizeChunkingStrategy implements ChunkingStrategy {
  constructor(private size: number = 10) {}

  public chunk(text: string): string[] {
    if (!text || this.size <= 0) return [];
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += this.size) {
      chunks.push(text.slice(i, i + this.size));
    }
    return chunks;
  }
}
