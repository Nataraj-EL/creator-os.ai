import { RetrievalResult } from '../../retrieval/types';
import { ContextBlock } from '../types';

export class RetrievalAdapter {
  public static mapToContextBlocks(results: RetrievalResult[]): ContextBlock[] {
    return results.map(res => {
      const record = res.memoryRecord;
      return {
        id: res.memoryId,
        content: record?.content || '',
        source: 'memory',
        relevanceScore: res.finalScore,
        importance: record?.importance ?? 5,
        timestamp: record?.createdAt || new Date().toISOString(),
        tokenCount: Math.ceil((record?.content || '').length / 4),
        selectionReason: res.retrievalReason || 'Retrieved via semantic matching.',
        metadata: {
          ...(record?.metadata || {}),
          retrieval: res.metadata
        }
      };
    });
  }
}
