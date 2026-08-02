import { ProviderResolver } from '../providers/registry';
import { StreamAdapter, StreamRequest } from './types';
import { StreamSessionController } from './controller';
import { ChunkingStrategy } from './chunking';
import { featureFlags as streamFlags } from './config/featureFlags';
import { ProviderError } from '../providers/errors';

export class StreamRuntime {
  constructor(
    private resolver: ProviderResolver,
    private adapter: StreamAdapter,
    private fallbackStrategy: ChunkingStrategy
  ) {}

  public createSession(
    request: StreamRequest,
    options?: { heartbeatEnabled?: boolean; traceId?: string; requestId?: string }
  ): StreamSessionController {
    const sessionId = 'stream-' + Math.random().toString(36).substring(2, 9);
    const traceId = options?.traceId || 'trace-' + Math.random().toString(36).substring(2, 9);
    const requestId = options?.requestId || 'req-' + Math.random().toString(36).substring(2, 9);
    const heartbeatEnabled = options?.heartbeatEnabled ?? streamFlags.STREAM_HEARTBEAT;

    const provider = this.resolver.resolve(request.provider);

    const runStream = async (signal: AbortSignal, sessionController: StreamSessionController) => {
      const startTime = Date.now();

      if (!provider.capabilities.streaming) {
        const providerResponse = await provider.generate({
          prompt: request.prompt,
          model: request.model,
          signal
        });

        const chunks = this.fallbackStrategy.chunk(providerResponse.content);
        for (const chunkContent of chunks) {
          if (signal.aborted) {
            throw new ProviderError('Stream cancelled during fallback.', provider.name, 'CANCELLED');
          }
          
          await new Promise(resolve => setTimeout(resolve, 10));

          sessionController.emit(this.adapter.normalize({
            content: chunkContent,
            done: false
          }));
        }
      } else {
        const providerStream = provider.stream({
          prompt: request.prompt,
          model: request.model,
          signal
        });

        for await (const chunk of providerStream) {
          if (signal.aborted) {
            throw new ProviderError('Stream cancelled.', provider.name, 'CANCELLED');
          }
          sessionController.emit(this.adapter.normalize(chunk));
        }
      }

      const endTime = Date.now();
      const completionLatency = endTime - startTime;
      const firstTokenLatency = sessionController.firstTokenTime 
        ? sessionController.firstTokenTime - startTime 
        : completionLatency;

      sessionController.emit({
        type: 'metadata',
        timestamp: new Date().toISOString(),
        metadata: {
          streamId: sessionId,
          traceId,
          provider: provider.name,
          model: request.model || 'unknown',
          firstTokenLatency,
          completionLatency,
          tokenCount: sessionController.tokenCount
        }
      });
    };

    return new StreamSessionController(
      sessionId,
      traceId,
      requestId,
      runStream,
      heartbeatEnabled
    );
  }
}
