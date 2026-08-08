import { Langfuse } from 'langfuse';
import { TraceEvent, TraceEventBus } from '../types';
import { featureFlags } from '../config/featureFlags';
import crypto from 'crypto';

export class LangfuseTraceProvider {
  private langfuse?: Langfuse;
  private activeTraces: Map<string, any> = new Map();
  private activeSpans: Map<string, any> = new Map();
  private unsubscribe?: () => void;

  constructor(eventBus: TraceEventBus) {
    this.initialize();
    if (this.langfuse) {
      this.unsubscribe = eventBus.subscribe((evt) => this.handleEvent(evt));
    }
  }

  public initialize(): void {
    try {
      const publicKey = process.env.LANGFUSE_PUBLIC_KEY || process.env.NEXT_PUBLIC_LANGFUSE_PUBLIC_KEY || '';
      const secretKey = process.env.LANGFUSE_SECRET_KEY || '';
      const host = process.env.LANGFUSE_HOST || process.env.NEXT_PUBLIC_LANGFUSE_HOST || 'https://cloud.langfuse.com';

      if (!featureFlags.LANGFUSE_ENABLED || !publicKey || !secretKey) {
        return;
      }

      this.langfuse = new Langfuse({
        publicKey,
        secretKey,
        baseUrl: host
      });
    } catch (err) {
      console.error("[LangfuseTraceProvider] Initialization failed (fail-open):", err);
    }
  }

  public dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.langfuse) {
      this.langfuse.shutdownAsync().catch(() => {});
    }
  }

  private handleEvent(event: TraceEvent): void {
    if (!this.langfuse) return;

    try {
      const key = `${event.traceId}-${event.component}`;
      const metadata = this.scrubMetadata(event.metadata);

      if (event.status === 'started') {
        const trace = this.getOrCreateTrace(event.traceId, event.requestId, event);
        
        let item;
        const isGeneration = event.stage === 'generation' || 
                             event.component === 'MockProvider' || 
                             event.component === 'ProviderRuntime';

        if (isGeneration) {
          const input = featureFlags.LANGFUSE_CAPTURE_INPUT 
            ? (event.metadata?.inputPrompt || event.metadata?.prompt || '')
            : undefined;

          item = trace.generation({
            name: event.component,
            startTime: new Date(event.timestamp),
            model: event.metadata?.model || 'unknown-model',
            input,
            metadata
          });
        } else {
          item = trace.span({
            name: event.component,
            startTime: new Date(event.timestamp),
            metadata
          });
        }
        this.activeSpans.set(key, item);

      } else if (event.status === 'completed') {
        const item = this.activeSpans.get(key);
        if (item) {
          const output = featureFlags.LANGFUSE_CAPTURE_OUTPUT
            ? (event.metadata?.generatedContent || event.metadata?.output || event.metadata?.response || '')
            : undefined;

          const updateParams: any = {
            endTime: new Date(event.timestamp),
            metadata
          };

          if (output !== undefined) {
            updateParams.output = output;
          }

          // Capture token counts if present in metadata
          if (event.metadata?.tokenCount || event.metadata?.usage) {
            const usage = event.metadata.usage || {};
            updateParams.usage = {
              promptTokens: usage.promptTokens || event.metadata.tokenCount || 0,
              completionTokens: usage.completionTokens || 0,
              totalTokens: usage.totalTokens || event.metadata.tokenCount || 0
            };
          }

          item.update(updateParams);
          this.activeSpans.delete(key);
        }

        // Clean up trace from cache when TraceMiddleware or main workflow finishes
        if (event.component === 'TraceMiddleware' || event.component === 'GenerationPipeline') {
          this.activeTraces.delete(event.traceId);
        }

      } else if (event.status === 'failed') {
        const item = this.activeSpans.get(key);
        if (item) {
          item.update({
            endTime: new Date(event.timestamp),
            statusMessage: event.metadata?.error || 'Failed execution.',
            metadata
          });
          this.activeSpans.delete(key);
        }

        if (event.component === 'TraceMiddleware' || event.component === 'GenerationPipeline') {
          this.activeTraces.delete(event.traceId);
        }
      }

    } catch (err) {
      console.error("[LangfuseTraceProvider] Fail-open: Failed to process telemetry span:", err);
    }
  }

  private getOrCreateTrace(traceId: string, requestId: string, event: TraceEvent) {
    let trace = this.activeTraces.get(traceId);
    if (!trace && this.langfuse) {
      trace = this.langfuse.trace({
        id: traceId,
        name: event.component === 'TraceMiddleware' ? 'generation-pipeline' : event.component,
        userId: event.metadata?.creatorId || event.metadata?.userId || 'unknown-creator',
        metadata: {
          requestId,
          ...this.scrubMetadata(event.metadata)
        }
      });
      this.activeTraces.set(traceId, trace);
    }
    return trace;
  }

  private scrubMetadata(metadata: Record<string, any>): Record<string, any> {
    if (!metadata) return {};
    const scrubbed = { ...metadata };
    
    const sensitiveKeys = [
      'authorization', 
      'x-api-key', 
      'api-key', 
      'apikey', 
      'secret', 
      'token', 
      'password', 
      'privatekey', 
      'credentials'
    ];

    const hashKeys = [
      'tenantid',
      'workspaceid',
      'tenant_id',
      'workspace_id'
    ];
    
    for (const key of Object.keys(scrubbed)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
        scrubbed[key] = '[REDACTED]';
      } else if (hashKeys.some(hk => lowerKey.includes(hk))) {
        if (typeof scrubbed[key] === 'string') {
          scrubbed[key] = 'hash-' + crypto.createHash('sha256').update(scrubbed[key]).digest('hex').substring(0, 16);
        } else {
          scrubbed[key] = '[REDACTED]';
        }
      } else if (typeof scrubbed[key] === 'string') {
        scrubbed[key] = scrubbed[key]
          .replace(/(postgres:\/\/|postgresql:\/\/)[^@\s]+@[^\s]+/g, '$1[REDACTED]')
          .replace(/(redis:\/\/|rediss:\/\/)[^@\s]+@[^\s]+/g, '$1[REDACTED]');
      } else if (typeof scrubbed[key] === 'object' && scrubbed[key] !== null) {
        scrubbed[key] = this.scrubMetadata(scrubbed[key]);
      }
    }
    
    if (!featureFlags.LANGFUSE_CAPTURE_INPUT) {
      const inputKeys = ['inputPrompt', 'prompt', 'input', 'topic', 'body'];
      for (const k of inputKeys) {
        if (k in scrubbed) {
          scrubbed[k] = '[REDACTED]';
        }
      }
    }
    
    if (!featureFlags.LANGFUSE_CAPTURE_OUTPUT) {
      const outputKeys = ['generatedContent', 'script', 'output', 'response', 'content', 'scriptDraft'];
      for (const k of outputKeys) {
        if (k in scrubbed) {
          scrubbed[k] = '[REDACTED]';
        }
      }
    }
    
    return scrubbed;
  }
}
