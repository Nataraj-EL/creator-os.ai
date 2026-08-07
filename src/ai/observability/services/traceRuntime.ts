import { 
  TraceEvent, 
  TraceEventInput, 
  Trace, 
  TraceStore, 
  TraceService, 
  TraceEventBus 
} from '../types';
import { LangfuseTraceProvider } from '../providers/langfuse';

export class DefaultTraceEventBus implements TraceEventBus {
  private listeners: Set<(event: TraceEvent) => void> = new Set();

  public publish(eventInput: TraceEventInput): void {
    const event: TraceEvent = {
      ...eventInput,
      eventId: `evt-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString()
    };

    // Fail-open event delivery
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[AI-OBSERVABILITY] Trace event listener failed:", err);
      }
    }
  }

  public subscribe(listener: (event: TraceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const traceEventBus = new DefaultTraceEventBus();

export class HybridTraceStore implements TraceStore {
  private inMemoryTraces: Map<string, Trace> = new Map();
  private key = 'creator-os-ai-traces';

  private loadLocalStorage(): Trace[] {
    if (typeof window === 'undefined') return [];
    try {
      const data = localStorage.getItem(this.key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveLocalStorage(traces: Trace[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.key, JSON.stringify(traces));
    } catch (e) {
      console.error("[AI-TRACE] Failed to save traces to localStorage:", e);
    }
  }

  public async saveTrace(trace: Trace): Promise<void> {
    this.inMemoryTraces.set(trace.traceId, trace);
    
    if (typeof window !== 'undefined') {
      const traces = this.loadLocalStorage();
      const idx = traces.findIndex(t => t.traceId === trace.traceId);
      if (idx >= 0) {
        traces[idx] = trace;
      } else {
        traces.push(trace);
      }
      this.saveLocalStorage(traces);
    }
  }

  public async getTrace(traceId: string): Promise<Trace | null> {
    if (this.inMemoryTraces.has(traceId)) {
      return this.inMemoryTraces.get(traceId) || null;
    }
    if (typeof window !== 'undefined') {
      const traces = this.loadLocalStorage();
      return traces.find(t => t.traceId === traceId) || null;
    }
    return null;
  }

  public async getAllTraces(): Promise<Trace[]> {
    if (typeof window !== 'undefined') {
      const traces = this.loadLocalStorage();
      // Sync memory with local storage
      for (const t of traces) {
        this.inMemoryTraces.set(t.traceId, t);
      }
    }
    return Array.from(this.inMemoryTraces.values());
  }

  public async clear(): Promise<void> {
    this.inMemoryTraces.clear();
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.key);
    }
  }
}

export class TraceRuntime implements TraceService {
  private store: TraceStore;
  private unsubscribe?: () => void;

  constructor(store: TraceStore) {
    this.store = store;
    // Subscribe to the event bus
    this.unsubscribe = traceEventBus.subscribe((evt) => this.handleEvent(evt));
  }

  public dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  private async handleEvent(event: TraceEvent): Promise<void> {
    try {
      let trace = await this.store.getTrace(event.traceId);
      if (!trace) {
        trace = {
          traceId: event.traceId,
          requestId: event.requestId,
          startTime: event.timestamp,
          status: 'active',
          events: [],
          metadata: {}
        };
      }

      // Latency calculation helper
      if (event.status === 'completed' || event.status === 'failed') {
        const startedEvent = trace.events.find(
          e => e.component === event.component && e.status === 'started'
        );
        if (startedEvent) {
          event.latencyMs = new Date(event.timestamp).getTime() - new Date(startedEvent.timestamp).getTime();
        }
      }

      trace.events.push(event);

      // Chronological sort
      trace.events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Update trace status and duration
      if (event.component === 'TraceMiddleware' || event.component === 'GenerationPipeline') {
        if (event.status === 'completed') {
          trace.status = 'completed';
          trace.endTime = event.timestamp;
          trace.durationMs = new Date(event.timestamp).getTime() - new Date(trace.startTime).getTime();
        } else if (event.status === 'failed') {
          trace.status = 'failed';
          trace.endTime = event.timestamp;
          trace.durationMs = new Date(event.timestamp).getTime() - new Date(trace.startTime).getTime();
        }
      }

      await this.store.saveTrace(trace);
    } catch (err) {
      console.error("[AI-OBSERVABILITY] Failed to process trace event:", err);
    }
  }

  public async getTrace(traceId: string): Promise<Trace | null> {
    return this.store.getTrace(traceId);
  }

  public async getAllTraces(): Promise<Trace[]> {
    return this.store.getAllTraces();
  }
}

export const traceRuntime = new TraceRuntime(new HybridTraceStore());
export const langfuseTraceProvider = new LangfuseTraceProvider(traceEventBus);
