export interface AIRequest {
  provider: string;
  model: string;
  prompt: string;
  inputs?: Record<string, any>;
  options?: Record<string, any>;
}

export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, any>;
}

export type AIPipelineType = 'generation' | 'memory' | 'retrieval' | 'context' | 'agent' | 'image' | string;

export interface AIContext {
  requestId: string;
  traceId: string;
  creatorId: string;
  stage: string; // matches EvaluationStage or custom sub-stage names
  pipeline: AIPipelineType;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  metadata: Record<string, any>;
}

export enum MiddlewareAction {
  CONTINUE = 'CONTINUE',
  STOP = 'STOP'
}

export interface MiddlewareMetadata {
  name: string;
  version: string;
  description: string;
}

export interface AIMiddleware {
  metadata: MiddlewareMetadata;
  priority: number; // Higher values indicate higher priority (runs first)
  before?(context: AIContext, request: AIRequest): Promise<MiddlewareAction | void> | MiddlewareAction | void;
  after?(context: AIContext, request: AIRequest, response: AIResponse): Promise<void> | void;
  onError?(context: AIContext, request: AIRequest, error: Error): Promise<void> | void;
  finally?(context: AIContext, request: AIRequest): Promise<void> | void;
}

export interface AIHandler<TReq extends AIRequest, TRes extends AIResponse> {
  handle(context: AIContext, request: TReq): Promise<TRes>;
}
