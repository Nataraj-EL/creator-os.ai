import { HttpTransport, HttpRequestOptions, HttpResponse, ConnectionPool } from './types';

export class DefaultConnectionPool implements ConnectionPool {
  private activeConnections: Map<string, Set<any>> = new Map();

  public async acquire(origin: string): Promise<any> {
    let pool = this.activeConnections.get(origin);
    if (!pool) {
      pool = new Set();
      this.activeConnections.set(origin, pool);
    }
    const connection = { id: Math.random().toString(36).substring(7), origin };
    pool.add(connection);
    return connection;
  }

  public async release(origin: string, connection: any): Promise<void> {
    const pool = this.activeConnections.get(origin);
    if (pool) {
      pool.delete(connection);
    }
  }

  public async closeAll(): Promise<void> {
    this.activeConnections.clear();
  }
}

export class FetchHttpTransport implements HttpTransport {
  constructor(private pool: ConnectionPool = new DefaultConnectionPool()) {}

  public async request<T = any>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    const urlObj = new URL(options.url);
    const origin = urlObj.origin;

    const connection = await this.pool.acquire(origin);

    let timeoutId: any;
    let abortController: AbortController | undefined;
    let signal = options.abortSignal;

    if (options.timeoutMs) {
      abortController = new AbortController();
      if (options.abortSignal) {
        options.abortSignal.addEventListener('abort', () => abortController?.abort());
      }
      signal = abortController.signal;
      timeoutId = setTimeout(() => {
        abortController?.abort();
      }, options.timeoutMs);
    }

    try {
      const response = await fetch(options.url, {
        method: options.method,
        headers: options.headers,
        body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
        signal
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        headers[key] = val;
      });

      let data: any;
      const contentType = headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return {
        status: response.status,
        data,
        headers
      };

    } catch (err: any) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      throw err;
    } finally {
      await this.pool.release(origin, connection);
    }
  }
}
