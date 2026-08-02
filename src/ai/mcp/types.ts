export interface MCPServer {
  id: string;
  name: string;
  version: string;
  url?: string;
  capabilities: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  };
}

export interface MCPClient {
  clientId: string;
  version: string;
}

export interface MCPTool {
  name: string;
  description: string;
  schema: any; // parameter properties JSON Schema
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: {
    name: string;
    description?: string;
    required?: boolean;
  }[];
}

export interface MCPSession {
  sessionId: string;
  serverId: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
  createdAt: string;
}

export interface MCPMessage {
  jsonrpc: '2.0';
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id?: string | number;
}

export interface MCPTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: MCPMessage): Promise<void>;
  onMessage(callback: (message: MCPMessage) => void): void;
  onClose(callback: () => void): void;
}

export interface ResourceCache {
  get(uri: string): Promise<string | null>;
  set(uri: string, content: string, ttlMs?: number): Promise<void>;
  delete(uri: string): Promise<void>;
}

export interface MCPDiscoveryProvider {
  discoverServers(): Promise<MCPServer[]>;
}

export type MCPLifecycleEventType =
  | 'SERVER_REGISTERED'
  | 'SERVER_CONNECTED'
  | 'SERVER_DISCONNECTED'
  | 'TOOL_INVOKED'
  | 'RESOURCE_READ'
  | 'TRANSPORT_CONNECTED'
  | 'TRANSPORT_DISCONNECTED'
  | 'MESSAGE_SENT'
  | 'MESSAGE_RECEIVED'
  | 'RECONNECTED';

export interface MCPLifecycleEvent {
  type: MCPLifecycleEventType;
  timestamp: string;
  serverId?: string;
  sessionId?: string;
  details?: Record<string, any>;
}

export type MCPLifecycleListener = (event: MCPLifecycleEvent) => void;
