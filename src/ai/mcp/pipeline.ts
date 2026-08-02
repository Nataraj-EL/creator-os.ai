import { MCPTransport, MCPMessage } from './types';

export class RequestPipeline {
  private pendingRequests: Map<string | number, {
    resolve: (msg: MCPMessage) => void;
    reject: (err: Error) => void;
  }> = new Map();

  private nextId = 1;

  constructor(private transport: MCPTransport) {
    this.transport.onMessage((message) => {
      this.handleIncomingMessage(message);
    });
  }

  public async sendRequest(method: string, params?: any): Promise<any> {
    const id = this.nextId++;
    const message: MCPMessage = {
      jsonrpc: '2.0',
      method,
      params,
      id
    };

    this.validateRequest(message);

    const promise = new Promise<any>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
    });

    try {
      await this.transport.send(message);
    } catch (err) {
      this.pendingRequests.delete(id);
      throw err;
    }

    const response = await promise;
    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message} (Code: ${response.error.code})`);
    }

    return response.result;
  }

  private validateRequest(message: MCPMessage): void {
    if (!message.method) {
      throw new Error("Invalid MCP Request: 'method' is required.");
    }
  }

  private handleIncomingMessage(message: MCPMessage): void {
    if (message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        pending.resolve(message);
      }
    }
  }
}
