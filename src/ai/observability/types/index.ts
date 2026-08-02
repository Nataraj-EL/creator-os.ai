export interface TraceEvent {
  eventId: string;
  traceId: string;
  requestId: string;
  timestamp: string; // ISO date
  stage: string;      // e.g. 'generation', 'middleware', 'evaluation', 'memory-learning', 'memory-runtime', 'retrieval', 'context', 'prompt-builder'
  component: string;  // Class/service/function name
  status: 'started' | 'completed' | 'failed';
  latencyMs?: number;
  metadata: Record<string, any>;
}

export interface TraceEventInput {
  traceId: string;
  requestId: string;
  stage: string;
  component: string;
  status: 'started' | 'completed' | 'failed';
  latencyMs?: number;
  metadata: Record<string, any>;
}

export interface Trace {
  traceId: string;
  requestId: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  status: 'active' | 'completed' | 'failed';
  events: TraceEvent[];
  metadata: Record<string, any>;
}

export interface TraceStore {
  saveTrace(trace: Trace): Promise<void>;
  getTrace(traceId: string): Promise<Trace | null>;
  getAllTraces(): Promise<Trace[]>;
  clear(): Promise<void>;
}

export interface TraceService {
  getTrace(traceId: string): Promise<Trace | null>;
  getAllTraces(): Promise<Trace[]>;
}

export interface TraceEventBus {
  publish(event: TraceEventInput): void;
  subscribe(listener: (event: TraceEvent) => void): () => void;
}
