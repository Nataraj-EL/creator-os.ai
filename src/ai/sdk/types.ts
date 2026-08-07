export interface SDKConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  auth?: { token?: string; apiKey?: string };
  timeoutMs?: number;
  retries?: number;
  version?: string;
}

export interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  body?: any;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

export interface HttpResponse<T = any> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export interface HttpTransport {
  request<T = any>(options: HttpRequestOptions): Promise<HttpResponse<T>>;
}

export interface ConnectionPool {
  acquire(origin: string): Promise<any>;
  release(origin: string, connection: any): Promise<void>;
  closeAll(): Promise<void>;
}

export type SDKMiddleware = (
  options: HttpRequestOptions,
  next: () => Promise<HttpResponse>
) => Promise<HttpResponse>;

export interface SDKInterceptor {
  request?: (options: HttpRequestOptions) => Promise<HttpRequestOptions> | HttpRequestOptions;
  response?: (response: HttpResponse) => Promise<HttpResponse> | HttpResponse;
}

export interface Serializer {
  serialize(data: any): string;
  deserialize<T = any>(text: string): T;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffFactorMs: number;
  retryableStatuses: number[];
}

export interface SSEEvent<T = any> {
  event: string;
  data: T;
  id?: string;
}

export type SSEListener = (event: SSEEvent) => void;

export class SDKError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: any,
    public readonly correlationId?: string
  ) {
    super(message);
    this.name = 'SDKError';
  }
}
