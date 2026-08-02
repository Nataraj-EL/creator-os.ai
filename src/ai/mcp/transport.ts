import { MCPTransport, MCPMessage } from './types';

export class InMemoryTransport implements MCPTransport {
  private messageCallback: ((msg: MCPMessage) => void) | null = null;
  private closeCallback: (() => void) | null = null;
  private connected = false;
  private partner: InMemoryTransport | null = null;

  public async connect(): Promise<void> {
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    if (this.closeCallback) {
      this.closeCallback();
    }
  }

  public setPartner(partner: InMemoryTransport): void {
    this.partner = partner;
  }

  public async send(message: MCPMessage): Promise<void> {
    if (!this.connected) {
      throw new Error("InMemoryTransport is not connected.");
    }
    if (this.partner && this.partner.connected && this.partner.messageCallback) {
      this.partner.messageCallback(JSON.parse(JSON.stringify(message)));
    }
  }

  public onMessage(callback: (message: MCPMessage) => void): void {
    this.messageCallback = callback;
  }

  public onClose(callback: () => void): void {
    this.closeCallback = callback;
  }
}
