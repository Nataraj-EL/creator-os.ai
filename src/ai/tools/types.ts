export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface ToolContext {
  requestId: string;
  traceId: string;
  creatorId: string;
  workspaceId: string;
  sessionId?: string;
  signal?: AbortSignal;
}

export interface Tool {
  name: string;
  description: string;
  schema: ToolSchema;
  category: string;
  execute(args: Record<string, any>, context: ToolContext): Promise<any>;
}

export interface ToolRequest {
  toolName: string;
  arguments: Record<string, any>;
  context: ToolContext;
}

export type ToolResultStatus = 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'TIMEOUT' | 'RETRY_EXHAUSTED';

export interface ToolExecutionResult {
  toolName: string;
  executionId: string;
  success: boolean;
  status: ToolResultStatus;
  output?: any;
  error?: string;
  latencyMs: number;
  retryCount: number;
}

export interface ToolResponse {
  results: ToolExecutionResult[];
}

export interface ToolExecutor {
  execute(tool: Tool, args: Record<string, any>, context: ToolContext): Promise<any>;
}

export interface ToolValidator {
  validate(tool: Tool, args: Record<string, any>): void;
}
