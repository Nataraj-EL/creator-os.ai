import axios from 'axios';
import { MCPTransport, MCPMessage } from '../types';

export class HttpTransport implements MCPTransport {
  private messageCallback: ((message: MCPMessage) => void) | null = null;
  private closeCallback: (() => void) | null = null;
  private abortController: AbortController | null = null;
  private connected = false;

  constructor(
    private url: string,
    private options: { timeout?: number; headers?: Record<string, string> } = {}
  ) {
    this.validateUrl(url);
  }

  public async connect(): Promise<void> {
    this.abortController = new AbortController();
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.closeCallback) {
      this.closeCallback();
    }
  }

  public async send(message: MCPMessage): Promise<void> {
    if (!this.connected) {
      throw new Error("HttpTransport is not connected.");
    }

    const cleanHeaders = this.redactSecrets(this.options.headers || {});

    try {
      const res = await axios.post(this.url, message, {
        headers: cleanHeaders,
        timeout: this.options.timeout || 10000,
        signal: this.abortController?.signal
      });

      if (this.messageCallback && res.data) {
        this.messageCallback(res.data);
      }
    } catch (err: any) {
      console.error(`[HttpTransport] request failed for endpoint ${this.url.split('?')[0]}:`, err.message);
      throw err;
    }
  }

  public onMessage(callback: (message: MCPMessage) => void): void {
    this.messageCallback = callback;
  }

  public onClose(callback: () => void): void {
    this.closeCallback = callback;
  }

  private validateUrl(urlStr: string): void {
    const url = new URL(urlStr);
    const hostname = url.hostname.toLowerCase();
    
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') ||
      hostname.startsWith('172.19.') ||
      hostname.startsWith('172.20.') ||
      hostname.startsWith('172.21.') ||
      hostname.startsWith('172.22.') ||
      hostname.startsWith('172.23.') ||
      hostname.startsWith('172.24.') ||
      hostname.startsWith('172.25.') ||
      hostname.startsWith('172.26.') ||
      hostname.startsWith('172.27.') ||
      hostname.startsWith('172.28.') ||
      hostname.startsWith('172.29.') ||
      hostname.startsWith('172.30.') ||
      hostname.startsWith('172.31.')
    ) {
      throw new Error(`SSRF Prevention: Blocked target hostname "${hostname}".`);
    }
  }

  private redactSecrets(headers: Record<string, string>): Record<string, string> {
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('auth') ||
        lowerKey.includes('key') ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret')
      ) {
        clean[key] = '[REDACTED]';
      } else {
        clean[key] = value;
      }
    }
    return clean;
  }
}
