import { memoryFeatureFlags } from './config/featureFlags';

export interface EmbeddingProvider {
  name: string;
  dimension: number;
  embed(text: string): Promise<number[]>;
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  public name = 'mock';
  
  constructor(public dimension: number = 768) {}

  public async embed(text: string): Promise<number[]> {
    const vec: number[] = [];
    let sumSq = 0;
    
    for (let i = 0; i < this.dimension; i++) {
      let hash = 0;
      for (let j = 0; j < text.length; j++) {
        hash = (hash * 31 + text.charCodeAt(j) + i) & 0xffff;
      }
      const val = (hash / 0xffff) * 2 - 1;
      vec.push(val);
      sumSq += val * val;
    }
    
    const len = Math.sqrt(sumSq) || 1.0;
    return vec.map(v => v / len);
  }
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  public name = 'gemini';
  public dimension = 768;

  constructor(private apiKey: string) {}

  public async embed(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error("Missing Gemini API key credentials for embedding generation.");
    }
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text }] }
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'No error body');
      throw new Error(`Gemini embedContent failed status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const values = data.embedding?.values;
    if (!Array.isArray(values)) {
      throw new Error("Invalid response format from Gemini embedding API.");
    }

    return values;
  }
}

export function getEmbeddingProvider(apiKey?: string, dimension?: number): EmbeddingProvider {
  const providerName = memoryFeatureFlags.EMBEDDING_PROVIDER || 'mock';
  const dim = dimension || 768;

  if (providerName === 'gemini') {
    const key = apiKey || process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
    return new GeminiEmbeddingProvider(key);
  }

  return new MockEmbeddingProvider(dim);
}
