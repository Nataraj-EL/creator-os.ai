import { 
  SDKConfig, 
  HttpTransport, 
  HttpRequestOptions, 
  HttpResponse, 
  SDKMiddleware, 
  SDKInterceptor, 
  Serializer, 
  SDKError 
} from './types';
import { FetchHttpTransport } from './transport';
import { JSONSerializer } from './serializer';
import { featureFlags } from './config/featureFlags';

export class SDKClient {
  private interceptors: SDKInterceptor[] = [];
  private middlewares: SDKMiddleware[] = [];
  public metrics: Array<{
    url: string;
    latencyMs: number;
    retries: number;
    success: boolean;
  }> = [];

  constructor(
    protected config: SDKConfig,
    private transport: HttpTransport = new FetchHttpTransport(),
    private serializer: Serializer = new JSONSerializer()
  ) {}

  public registerInterceptor(interceptor: SDKInterceptor): void {
    this.interceptors.push(interceptor);
  }

  public registerMiddleware(middleware: SDKMiddleware): void {
    this.middlewares.push(middleware);
  }

  public async request<T = any>(options: HttpRequestOptions): Promise<T> {
    if (!featureFlags.SDK_RUNTIME) {
      throw new Error("SDK Runtime is disabled by feature flags.");
    }

    const startTime = Date.now();
    let currentOptions = { ...options };

    if (this.config.baseUrl && !currentOptions.url.startsWith('http')) {
      currentOptions.url = `${this.config.baseUrl}${currentOptions.url}`;
    }

    currentOptions.headers = {
      ...this.config.headers,
      ...currentOptions.headers
    };

    if (this.config.auth?.token) {
      currentOptions.headers['Authorization'] = `Bearer ${this.config.auth.token}`;
    } else if (this.config.auth?.apiKey) {
      currentOptions.headers['X-API-Key'] = this.config.auth.apiKey;
    }

    if (this.config.timeoutMs && !currentOptions.timeoutMs) {
      currentOptions.timeoutMs = this.config.timeoutMs;
    }

    for (const interceptor of this.interceptors) {
      if (interceptor.request) {
        currentOptions = await interceptor.request(currentOptions);
      }
    }

    const maxRetries = this.config.retries ?? 2;
    const retryableStatuses = [429, 503, 504];
    let attempt = 0;
    let rawResponse: HttpResponse | undefined;

    while (attempt <= maxRetries) {
      if (currentOptions.abortSignal?.aborted) {
        throw new SDKError('CANCELLED', 'Request was cancelled by client.');
      }

      try {
        const runMiddleware = async (index: number): Promise<HttpResponse> => {
          if (index < this.middlewares.length) {
            const nextMiddleware = this.middlewares[index];
            return nextMiddleware(currentOptions, () => runMiddleware(index + 1));
          }
          return this.transport.request(currentOptions);
        };

        rawResponse = await runMiddleware(0);

        if (retryableStatuses.includes(rawResponse.status) && attempt < maxRetries) {
          attempt++;
          const backoff = Math.pow(2, attempt) * 50;
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, backoff);
            if (currentOptions.abortSignal) {
              currentOptions.abortSignal.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new SDKError('CANCELLED', 'Request was cancelled during retry backoff.'));
              });
            }
          });
          continue;
        }

        break;

      } catch (err: any) {
        if (err.name === 'AbortError' || currentOptions.abortSignal?.aborted) {
          throw new SDKError('CANCELLED', 'Request was cancelled.');
        }

        if (attempt < maxRetries) {
          attempt++;
          const backoff = Math.pow(2, attempt) * 50;
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, backoff);
            if (currentOptions.abortSignal) {
              currentOptions.abortSignal.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new SDKError('CANCELLED', 'Request was cancelled during retry backoff.'));
              });
            }
          });
          continue;
        }
        throw new SDKError('INTERNAL_ERROR', err.message || 'Request connection failed.');
      }
    }

    if (!rawResponse) {
      throw new SDKError('INTERNAL_ERROR', 'Request completed without response.');
    }

    let finalResponse = rawResponse;
    for (const interceptor of this.interceptors) {
      if (interceptor.response) {
        finalResponse = await interceptor.response(finalResponse);
      }
    }

    const latencyMs = Date.now() - startTime;
    const success = finalResponse.status >= 200 && finalResponse.status < 300;

    this.metrics.push({
      url: currentOptions.url,
      latencyMs,
      retries: attempt,
      success
    });

    if (!success) {
      const errorData = typeof finalResponse.data === 'string' 
        ? this.serializer.deserialize(finalResponse.data) 
        : finalResponse.data;

      const code = errorData?.error?.code || 'INTERNAL_ERROR';
      const msg = errorData?.error?.message || 'Server error occurred.';
      const details = errorData?.error?.details || undefined;
      const correlationId = errorData?.error?.correlationId || finalResponse.headers['x-correlation-id'] || undefined;

      throw new SDKError(code, msg, details, correlationId);
    }

    return finalResponse.data;
  }

  public async *paginate<Item = any>(
    options: HttpRequestOptions,
    pageParam = 'page',
    limitParam = 'limit'
  ): AsyncGenerator<Item[]> {
    let currentPage = 1;
    let hasMore = true;

    while (hasMore) {
      const url = new URL(options.url, this.config.baseUrl);
      url.searchParams.set(pageParam, String(currentPage));
      
      const currentOptions: HttpRequestOptions = {
        ...options,
        url: url.pathname + url.search
      };

      const response = await this.request<any>(currentOptions);
      const items = Array.isArray(response) ? response : (response.data || response.items || []);

      if (!Array.isArray(items) || items.length === 0) {
        hasMore = false;
        break;
      }

      yield items;
      currentPage++;
    }
  }
}
