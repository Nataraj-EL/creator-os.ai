import { StreamAdapter, StreamEvent } from './types';

export class DefaultStreamAdapter implements StreamAdapter {
  public normalize(chunk: any): StreamEvent {
    if (chunk && typeof chunk.type === 'string') {
      return chunk as StreamEvent;
    }

    const isDone = chunk.done === true;
    return {
      type: isDone ? 'completion' : 'token',
      content: chunk.content || '',
      timestamp: new Date().toISOString(),
      metadata: chunk.metadata || {}
    };
  }
}
