export interface ProviderCapability {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  multimodal: boolean;
  embeddings: boolean;
  jsonMode: boolean;
  functionCalling: boolean;
}

export interface ProviderRequest {
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  metadata?: Record<string, any>;
  signal?: AbortSignal;
}

export interface ProviderResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, any>;
}

export interface StreamingChunk {
  content: string;
  done: boolean;
  metadata?: Record<string, any>;
}

export interface AIProvider {
  name: string;
  capabilities: ProviderCapability;
  generate(request: ProviderRequest): Promise<ProviderResponse>;
  stream(request: ProviderRequest): AsyncIterable<StreamingChunk>;
}
