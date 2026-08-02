import { ToolRegistry } from './registry';
import { ToolExecutor, ToolValidator, ToolRequest, ToolExecutionResult, ToolResultStatus } from './types';
import { featureFlags as toolFlags } from './config/featureFlags';
import { traceEventBus } from '../observability/services/traceRuntime';

export class ToolRuntime {
  constructor(
    private registry: ToolRegistry,
    private executor: ToolExecutor,
    private validator: ToolValidator
  ) {}

  public async execute(
    request: ToolRequest,
    options?: { timeoutMs?: number; maxRetries?: number }
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const tool = this.registry.resolve(request.toolName);
    const executionId = 'exec-' + Math.random().toString(36).substring(2, 9);
    const context = request.context;

    // Pre-flight schema validation
    if (toolFlags.TOOL_VALIDATION) {
      try {
        this.validator.validate(tool, request.arguments);
      } catch (err: any) {
        const latencyMs = Date.now() - startTime;
        const result: ToolExecutionResult = {
          toolName: tool.name,
          executionId,
          success: false,
          status: 'FAILED',
          error: `Validation failed: ${err.message}`,
          latencyMs,
          retryCount: 0
        };
        this.logTrace(tool.name, executionId, context.traceId, latencyMs, 0, 'FAILED');
        return result;
      }
    }

    const timeoutMs = options?.timeoutMs || 5000;
    const maxRetries = toolFlags.TOOL_RETRIES ? (options?.maxRetries ?? 2) : 0;
    
    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      let timer: NodeJS.Timeout | null = null;

      const linkSignal = () => {
        controller.abort();
      };
      if (context.signal) {
        context.signal.addEventListener('abort', linkSignal);
      }

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`Tool execution timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      });

      let abortListener: (() => void) | null = null;
      const abortPromise = new Promise<never>((_, reject) => {
        if (context.signal) {
          abortListener = () => {
            reject(new Error('Cancelled'));
          };
          context.signal.addEventListener('abort', abortListener);
          if (context.signal.aborted) {
            reject(new Error('Cancelled'));
          }
        }
      });

      const executePromise = (async () => {
        if (controller.signal.aborted) {
          throw new Error('Cancelled');
        }
        return await this.executor.execute(tool, request.arguments, {
          ...context,
          signal: controller.signal
        });
      })();

      try {
        const output = await Promise.race([executePromise, timeoutPromise, abortPromise]);
        const latencyMs = Date.now() - startTime;
        
        const result: ToolExecutionResult = {
          toolName: tool.name,
          executionId,
          success: true,
          status: 'SUCCESS',
          output,
          latencyMs,
          retryCount: attempt
        };

        this.logTrace(tool.name, executionId, context.traceId, latencyMs, attempt, 'SUCCESS');
        return result;
      } catch (err: any) {
        const isTimeout = err.message?.includes('timeout') || err.message?.includes('timed out');
        const isCancelled = (context.signal?.aborted || err.message === 'Cancelled') && !isTimeout;

        if (isCancelled) {
          const latencyMs = Date.now() - startTime;
          const result: ToolExecutionResult = {
            toolName: tool.name,
            executionId,
            success: false,
            status: 'CANCELLED',
            error: 'Tool execution cancelled by user.',
            latencyMs,
            retryCount: attempt
          };
          this.logTrace(tool.name, executionId, context.traceId, latencyMs, attempt, 'CANCELLED');
          return result;
        }

        if (isTimeout) {
          if (attempt >= maxRetries) {
            const latencyMs = Date.now() - startTime;
            const result: ToolExecutionResult = {
              toolName: tool.name,
              executionId,
              success: false,
              status: 'TIMEOUT',
              error: err.message,
              latencyMs,
              retryCount: attempt
            };
            this.logTrace(tool.name, executionId, context.traceId, latencyMs, attempt, 'TIMEOUT');
            return result;
          }
        } else {
          // General failure retry check
          if (attempt >= maxRetries) {
            const latencyMs = Date.now() - startTime;
            const result: ToolExecutionResult = {
              toolName: tool.name,
              executionId,
              success: false,
              status: 'RETRY_EXHAUSTED',
              error: err.message || 'Tool execution retries exhausted.',
              latencyMs,
              retryCount: attempt
            };
            this.logTrace(tool.name, executionId, context.traceId, latencyMs, attempt, 'RETRY_EXHAUSTED');
            return result;
          }
        }

        attempt++;
      } finally {
        if (timer) clearTimeout(timer);
        if (abortListener && context.signal) {
          context.signal.removeEventListener('abort', abortListener);
        }
        if (context.signal) {
          context.signal.removeEventListener('abort', linkSignal);
        }
      }
    }
  }

  private logTrace(
    toolName: string, 
    executionId: string, 
    traceId: string, 
    latencyMs: number, 
    retryCount: number, 
    status: ToolResultStatus
  ) {
    try {
      traceEventBus.publish({
        traceId,
        requestId: 'req-mw-' + Math.random().toString(36).substring(2, 9),
        component: 'ToolRuntime',
        stage: 'GENERATION',
        status: status === 'SUCCESS' ? 'completed' : 'failed',
        metadata: {
          toolId: toolName,
          executionId,
          traceId,
          duration: latencyMs,
          retryCount,
          status
        }
      });
    } catch {
      // Fail-open logging
    }
  }
}
