import { ToolResponse, ToolExecutionResult, ToolContext } from './types';
import { ToolRuntime } from './runtime';

export class ToolResolver {
  constructor(private runtime: ToolRuntime) {}

  public async resolveAndRoute(providerPayload: any, context: ToolContext): Promise<ToolResponse> {
    const results: ToolExecutionResult[] = [];

    if (!providerPayload) {
      return { results };
    }

    let calls: any[] = [];
    if (Array.isArray(providerPayload.functionCalls)) {
      calls = providerPayload.functionCalls;
    } else if (providerPayload.name && providerPayload.arguments) {
      calls = [providerPayload];
    } else if (providerPayload.tool_calls && Array.isArray(providerPayload.tool_calls)) {
      calls = providerPayload.tool_calls.map((tc: any) => tc.function || tc);
    }

    for (const call of calls) {
      const toolName = call.name || call.functionName;
      let args = call.arguments || {};
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          args = {};
        }
      }

      if (toolName) {
        try {
          const res = await this.runtime.execute({
            toolName,
            arguments: args,
            context
          });
          results.push(res);
        } catch (err: any) {
          results.push({
            toolName,
            executionId: 'exec-' + Math.random().toString(36).substring(2, 9),
            success: false,
            status: 'FAILED',
            error: err.message || 'Tool resolution failure.',
            latencyMs: 0,
            retryCount: 0
          });
        }
      }
    }

    return { results };
  }
}
