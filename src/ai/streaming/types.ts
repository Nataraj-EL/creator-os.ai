export type StreamEventType = 'token' | 'reasoning' | 'completion' | 'error' | 'metadata' | 'heartbeat';

export interface StreamEvent {
  type: StreamEventType;
  content?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface StreamRequest {
  prompt: string;
  model?: string;
  provider?: string;
  metadata?: Record<string, any>;
  signal?: AbortSignal;
}

export interface StreamSubscriber {
  onEvent(event: StreamEvent): void;
}

export interface StreamSession {
  sessionId: string;
  traceId: string;
  requestId: string;
  status: 'active' | 'paused' | 'cancelled' | 'completed' | 'error';
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  cancel(): void;
  complete(): void;
  heartbeat(): void;
  subscribe(subscriber: StreamSubscriber): void;
  unsubscribe(subscriber: StreamSubscriber): void;
}

export interface StreamAdapter {
  normalize(chunk: any): StreamEvent;
}
