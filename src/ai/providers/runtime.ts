import { ProviderRegistry } from './registry';
import { RetryPolicy, TimeoutPolicy } from './policies';
import { AIProvider, ProviderRequest, ProviderResponse, StreamingChunk } from './types';
import { ProviderError } from './errors';

export class ProviderRuntime {
  constructor(
    private registry: ProviderRegistry,
    private retryPolicy: RetryPolicy,
    private timeoutPolicy: TimeoutPolicy
  ) {}

  public async generate(
    provider: AIProvider,
    request: ProviderRequest
  ): Promise<ProviderResponse & { retryCount: number; latencyMs: number }> {
    let attemptCount = 0;
    const startTime = Date.now();

    try {
      const response = await this.retryPolicy.execute(
        async (attempt) => {
          attemptCount = attempt;
          return await this.timeoutPolicy.execute(
            async (signal) => {
              return await provider.generate({
                ...request,
                signal
              });
            },
            request.signal
          );
        },
        (attempt, err) => {
          console.warn(`[ProviderRuntime] Retrying generation on provider ${provider.name}. Attempt: ${attempt}. Error:`, err);
        }
      );

      const latencyMs = Date.now() - startTime;
      return {
        ...response,
        retryCount: attemptCount,
        latencyMs
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      throw this.mapError(err, provider.name, latencyMs, attemptCount);
    }
  }

  public stream(
    provider: AIProvider,
    request: ProviderRequest
  ): AsyncIterable<StreamingChunk> {
    const timeoutPolicy = this.timeoutPolicy;

    const streamGenerator = async function* () {
      try {
        const iterable = provider.stream(request);
        const iterator = iterable[Symbol.asyncIterator]();

        while (true) {
          const nextResult = await timeoutPolicy.execute(
            async () => {
              return await iterator.next();
            },
            request.signal
          );

          if (nextResult.done) {
            break;
          }

          yield nextResult.value;
        }
      } catch (err: any) {
        if (err instanceof ProviderError) {
          throw err;
        }
        if (err.name === 'AbortError' || err.message === 'Request aborted') {
          throw new ProviderError('Streaming request aborted by caller.', provider.name, 'CANCELLED', err);
        }
        throw new ProviderError(err.message || 'Streaming failed.', provider.name, 'UNKNOWN', err);
      }
    };

    return {
      [Symbol.asyncIterator]: () => streamGenerator()
    };
  }

  private mapError(err: any, providerName: string, latencyMs: number, retryCount: number): ProviderError {
    if (err instanceof ProviderError) {
      if (err.originalError) {
        err.originalError.latencyMs = latencyMs;
        err.originalError.retryCount = retryCount;
      }
      return err;
    }

    let code: any = 'UNKNOWN';
    const message = err.message || 'Provider execution failed.';

    if (err.name === 'AbortError' || message.includes('aborted') || message.includes('cancelled')) {
      code = 'CANCELLED';
    } else if (message.includes('timeout') || message.includes('timed out')) {
      code = 'TIMEOUT';
    } else if (message.includes('429') || message.includes('rate limit')) {
      code = 'RATE_LIMIT';
    } else if (message.includes('401') || message.includes('403') || message.includes('auth')) {
      code = 'AUTH_ERROR';
    } else if (message.includes('400') || message.includes('bad request')) {
      code = 'BAD_REQUEST';
    }

    return new ProviderError(message, providerName, code, err);
  }
}
