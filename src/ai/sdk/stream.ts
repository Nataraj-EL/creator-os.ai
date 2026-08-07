import { SSEEvent, SSEListener } from './types';
import { featureFlags } from './config/featureFlags';

export class SSEClientStream {
  private listeners: Set<SSEListener> = new Set();
  private lastEventId?: string;
  private abortController?: AbortController;
  private shouldReconnect = true;
  private reconnectTimeout?: any;

  constructor() {}

  public addListener(listener: SSEListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: SSEListener): void {
    this.listeners.delete(listener);
  }

  public async connect(url: string, headers: Record<string, string> = {}): Promise<void> {
    if (!featureFlags.SDK_STREAMING) return;
    this.shouldReconnect = true;
    await this.startStream(url, headers);
  }

  private async startStream(url: string, headers: Record<string, string>): Promise<void> {
    this.abortController = new AbortController();

    const requestHeaders = { ...headers };
    if (this.lastEventId) {
      requestHeaders['Last-Event-ID'] = this.lastEventId;
    }

    try {
      const response = await fetch(url, {
        headers: requestHeaders,
        signal: this.abortController.signal
      });

      if (!response.ok) {
        throw new Error(`SSE stream connection failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Response body reader is not available.");
      }

      const decoder = new TextDecoder('utf8');
      let buffer = '';
      let currentEvent = 'message';
      let currentData = '';

      while (this.shouldReconnect) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === '') {
            if (currentData) {
              let parsedData = currentData;
              try {
                parsedData = JSON.parse(currentData);
              } catch (e) {
                // Keep raw string
              }
              this.emit({
                event: currentEvent,
                data: parsedData,
                id: this.lastEventId
              });
            }
            currentEvent = 'message';
            currentData = '';
            continue;
          }

          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.substring(6).trim();
          } else if (trimmed.startsWith('data:')) {
            currentData += (currentData ? '\n' : '') + trimmed.substring(5).trim();
          } else if (trimmed.startsWith('id:')) {
            this.lastEventId = trimmed.substring(3).trim();
          }
        }
      }

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.emit({ event: 'error', data: err.message });
      this.handleReconnect(url, headers);
    }
  }

  private handleReconnect(url: string, headers: Record<string, string>): void {
    if (!this.shouldReconnect) return;
    this.reconnectTimeout = setTimeout(() => {
      this.startStream(url, headers);
    }, 100);
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  private emit(event: SSEEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[SSEClientStream] Listener failed:", err);
      }
    }
  }
}
