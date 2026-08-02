import { StreamSession, StreamEvent, StreamSubscriber } from './types';

export class StreamSessionController implements StreamSession {
  public status: 'active' | 'paused' | 'cancelled' | 'completed' | 'error' = 'active';
  private subscribers: Set<StreamSubscriber> = new Set();
  private abortController = new AbortController();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  public tokenCount = 0;
  public startTime: number;
  public firstTokenTime?: number;

  constructor(
    public sessionId: string,
    public traceId: string,
    public requestId: string,
    private runStream: (signal: AbortSignal, controller: StreamSessionController) => Promise<void>,
    private heartbeatEnabled: boolean = false
  ) {
    this.startTime = Date.now();
  }

  public subscribe(subscriber: StreamSubscriber): void {
    this.subscribers.add(subscriber);
  }

  public unsubscribe(subscriber: StreamSubscriber): void {
    this.subscribers.delete(subscriber);
  }

  public emit(event: StreamEvent): void {
    if (event.type === 'token') {
      this.tokenCount++;
      if (!this.firstTokenTime) {
        this.firstTokenTime = Date.now();
      }
    }

    for (const sub of this.subscribers) {
      try {
        sub.onEvent(event);
      } catch (err) {
        console.error(`[StreamSessionController] Callback failed:`, err);
      }
    }
  }

  public async start(): Promise<void> {
    this.status = 'active';
    this.emit({
      type: 'metadata',
      timestamp: new Date().toISOString(),
      metadata: { state: 'started', startTime: this.startTime }
    });

    if (this.heartbeatEnabled) {
      this.heartbeatInterval = setInterval(() => {
        this.heartbeat();
      }, 1000);
    }

    try {
      await this.runStream(this.abortController.signal, this);
      this.complete();
    } catch (err: any) {
      if ((this.status as string) !== 'cancelled') {
        this.status = 'error';
        this.emit({
          type: 'error',
          content: err.message || 'Stream generation failed.',
          timestamp: new Date().toISOString()
        });
      }
    } finally {
      this.stopHeartbeat();
    }
  }

  public pause(): void {
    if (this.status === 'active') {
      this.status = 'paused';
      this.emit({
        type: 'metadata',
        timestamp: new Date().toISOString(),
        metadata: { state: 'paused' }
      });
    }
  }

  public resume(): void {
    if (this.status === 'paused') {
      this.status = 'active';
      this.emit({
        type: 'metadata',
        timestamp: new Date().toISOString(),
        metadata: { state: 'resumed' }
      });
    }
  }

  public cancel(): void {
    if (this.status === 'active' || this.status === 'paused') {
      this.status = 'cancelled';
      this.abortController.abort();
      this.emit({
        type: 'metadata',
        timestamp: new Date().toISOString(),
        metadata: { state: 'cancelled' }
      });
      this.stopHeartbeat();
    }
  }

  public complete(): void {
    if (this.status === 'active' || this.status === 'paused') {
      this.status = 'completed';
      const durationMs = Date.now() - this.startTime;
      this.emit({
        type: 'completion',
        timestamp: new Date().toISOString(),
        metadata: { durationMs, tokenCount: this.tokenCount }
      });
      this.stopHeartbeat();
    }
  }

  public heartbeat(): void {
    if (this.status === 'active') {
      this.emit({
        type: 'heartbeat',
        timestamp: new Date().toISOString()
      });
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
