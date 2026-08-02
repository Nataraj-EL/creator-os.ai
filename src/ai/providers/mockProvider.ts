import { AIProvider, ProviderRequest, ProviderResponse, StreamingChunk, ProviderCapability } from './types';

export class MockProvider implements AIProvider {
  public name = 'mock';
  public capabilities: ProviderCapability = {
    streaming: true,
    tools: true,
    vision: true,
    multimodal: true,
    embeddings: true,
    jsonMode: true,
    functionCalling: true
  };

  private mockResponse = 'Simulated content draft response from mock provider.';
  private configuredLatency = 0;
  private configuredError: Error | null = null;

  public setMockResponse(response: string): void {
    this.mockResponse = response;
  }

  public setLatency(latencyMs: number): void {
    this.configuredLatency = latencyMs;
  }

  public setError(error: Error | null): void {
    this.configuredError = error;
  }

  public setCapabilities(caps: Partial<ProviderCapability>): void {
    this.capabilities = {
      ...this.capabilities,
      ...caps
    };
  }

  public async generate(request: ProviderRequest): Promise<ProviderResponse> {
    if (this.configuredError) {
      throw this.configuredError;
    }

    if (this.configuredLatency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.configuredLatency));
    }

    if (request.signal?.aborted) {
      throw new Error('Request aborted');
    }

    return {
      content: this.mockResponse,
      model: request.model || 'mock-model',
      metadata: {
        provider: this.name,
        promptLength: request.prompt.length
      }
    };
  }

  public async *stream(request: ProviderRequest): AsyncGenerator<StreamingChunk, void, unknown> {
    if (this.configuredError) {
      throw this.configuredError;
    }

    const words = this.mockResponse.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      if (request.signal?.aborted) {
        throw new Error('Request aborted');
      }

      if (this.configuredLatency > 0) {
        await new Promise(
          resolve => setTimeout(resolve, Math.round(this.configuredLatency / words.length))
        );
      }

      yield {
        content: words[i] + (i === words.length - 1 ? '' : ' '),
        done: i === words.length - 1
      };
    }
  }
}
