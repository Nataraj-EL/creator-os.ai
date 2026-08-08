import { spawn, ChildProcess } from 'child_process';
import { MCPTransport, MCPMessage } from '../types';

export class StdioTransport implements MCPTransport {
  private process: ChildProcess | null = null;
  private messageCallback: ((message: MCPMessage) => void) | null = null;
  private closeCallback: (() => void) | null = null;
  private buffer = '';

  constructor(
    private command: string,
    private args: string[] = [],
    private options: { timeout?: number; env?: Record<string, string> } = {}
  ) {
    if (!this.command || typeof this.command !== 'string' || this.command.includes(';') || this.command.includes('&')) {
      throw new Error("Invalid stdio executable command.");
    }
  }

  public async connect(): Promise<void> {

    const cleanEnv = this.options.env || this.sanitizeEnv(process.env);

    const child = spawn(this.command, this.args, {
      shell: false,
      env: cleanEnv as NodeJS.ProcessEnv
    });

    this.process = child;

    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (data: string) => {
        this.buffer += data;
        this.processBuffer();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        console.warn(`[StdioTransport stderr]: ${data.toString()}`);
      });
    }

    child.on('close', () => {
      if (this.closeCallback) {
        this.closeCallback();
      }
    });

    child.on('error', (err) => {
      console.error("[StdioTransport error]:", err);
    });

    if (this.options.timeout) {
      setTimeout(() => {
        if (this.process) {
          console.warn(`[StdioTransport] Process timeout of ${this.options.timeout}ms exceeded. Terminating.`);
          this.disconnect().catch(() => {});
        }
      }, this.options.timeout);
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.process) return;

    this.process.kill('SIGTERM');

    const proc = this.process;
    this.process = null;

    setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch (err) {
        // already stopped
      }
    }, 2000);

    if (this.closeCallback) {
      this.closeCallback();
    }
  }

  public async send(message: MCPMessage): Promise<void> {
    if (!this.process || !this.process.stdin) {
      throw new Error("StdioTransport is not connected.");
    }
    const payload = JSON.stringify(message) + '\n';
    this.process.stdin.write(payload);
  }

  public onMessage(callback: (message: MCPMessage) => void): void {
    this.messageCallback = callback;
  }

  public onClose(callback: () => void): void {
    this.closeCallback = callback;
  }

  private processBuffer(): void {
    let newlineIdx = this.buffer.indexOf('\n');
    while (newlineIdx !== -1) {
      const line = this.buffer.substring(0, newlineIdx).trim();
      this.buffer = this.buffer.substring(newlineIdx + 1);

      if (line) {
        try {
          const message: MCPMessage = JSON.parse(line);
          if (this.messageCallback) {
            this.messageCallback(message);
          }
        } catch (err) {
          console.error("[StdioTransport] Failed to parse message:", err);
        }
      }
      newlineIdx = this.buffer.indexOf('\n');
    }
  }

  private sanitizeEnv(env: Record<string, string | undefined>): Record<string, string> {
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) continue;
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('secret') ||
        lowerKey.includes('key') ||
        lowerKey.includes('token') ||
        lowerKey.includes('password') ||
        lowerKey.includes('auth')
      ) {
        continue;
      }
      clean[key] = value;
    }
    return clean;
  }
}
