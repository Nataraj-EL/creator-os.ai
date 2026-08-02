import { ProviderError } from './errors';

export interface RetryPolicy {
  execute<T>(
    operation: (attempt: number) => Promise<T>, 
    onRetry?: (attempt: number, error: any) => void
  ): Promise<T>;
}

export class ExponentialBackoffRetryPolicy implements RetryPolicy {
  constructor(
    private maxRetries: number = 3,
    private initialDelayMs: number = 100,
    private backoffFactor: number = 2,
    private enabled: boolean = true
  ) {}

  public async execute<T>(
    operation: (attempt: number) => Promise<T>, 
    onRetry?: (attempt: number, error: any) => void
  ): Promise<T> {
    if (!this.enabled || this.maxRetries <= 0) {
      return operation(0);
    }

    let attempt = 0;
    while (true) {
      try {
        return await operation(attempt);
      } catch (err: any) {
        // Do not retry cancellation errors
        if (err instanceof ProviderError && err.code === 'CANCELLED') {
          throw err;
        }

        if (attempt >= this.maxRetries) {
          throw err;
        }

        attempt++;
        if (onRetry) {
          onRetry(attempt, err);
        }

        const delay = this.initialDelayMs * Math.pow(this.backoffFactor, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}

export interface TimeoutPolicy {
  execute<T>(
    operation: (signal: AbortSignal) => Promise<T>, 
    requestSignal?: AbortSignal
  ): Promise<T>;
}

export class DefaultTimeoutPolicy implements TimeoutPolicy {
  constructor(private timeoutMs: number = 5000) {}

  public async execute<T>(
    operation: (signal: AbortSignal) => Promise<T>, 
    requestSignal?: AbortSignal
  ): Promise<T> {
    const controller = new AbortController();

    // Link incoming request signal if present
    const onAbort = () => {
      controller.abort();
    };

    if (requestSignal) {
      if (requestSignal.aborted) {
        throw new ProviderError('Request cancelled by caller.', 'unknown', 'CANCELLED');
      }
      requestSignal.addEventListener('abort', onAbort);
    }

    // Set timeout trigger
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ProviderError(`Operation timed out after ${this.timeoutMs}ms.`, 'unknown', 'TIMEOUT'));
      }, this.timeoutMs);
    });

    try {
      const operationPromise = operation(controller.signal);
      return await Promise.race([operationPromise, timeoutPromise]);
    } catch (err: any) {
      // If abort signal was fired and the error is not a Timeout error, it must be Cancelled
      if (controller.signal.aborted && !(err instanceof ProviderError && err.code === 'TIMEOUT')) {
        throw new ProviderError('Request aborted by caller.', 'unknown', 'CANCELLED', err);
      }
      throw err;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
      if (requestSignal) {
        requestSignal.removeEventListener('abort', onAbort);
      }
    }
  }
}
