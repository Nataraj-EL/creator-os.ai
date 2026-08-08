export interface AICacheOptions {
  ttlSeconds?: number;
  namespace?: string;
  traceId?: string;
  requestId?: string;
  tenantId?: string;
  workspaceId?: string;
}

export interface AICache {
  get<T>(key: string, options?: AICacheOptions): Promise<T | null>;
  set<T>(key: string, value: T, options?: AICacheOptions): Promise<void>;
  delete(key: string, options?: AICacheOptions): Promise<void>;
  clear?(): Promise<void>;
}
