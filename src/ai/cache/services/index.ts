import { AICache, AICacheOptions } from '../types';
import { traceEventBus } from '../../observability';
import { featureFlags } from '../config/featureFlags';

export class DefaultAICache implements AICache {
  private client?: any;
  private memoryCache = new Map<string, { value: any; expiry: number }>();
  private isRedisAvailable = false;
  private namespace = 'ai-cache';

  constructor(redisUrl?: string) {
    const url = redisUrl || process.env.REDIS_URL;
    if (url && (url.startsWith('redis://') || url.startsWith('rediss://'))) {
      try {
        const redisModuleName = 'ioredis';
        const Redis = typeof window === 'undefined' ? require(redisModuleName) : null;
        if (Redis) {
          this.client = new Redis(url, {
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            connectTimeout: 1000,
            retryStrategy() {
              return null; // Fail-open and do not repeatedly reconnect
            }
          });

          this.client.on('connect', () => {
            this.isRedisAvailable = true;
          });

          this.client.on('error', (err: any) => {
            this.isRedisAvailable = false;
          });

          this.client.on('close', () => {
            this.isRedisAvailable = false;
          });
        }
      } catch (err: any) {
        this.isRedisAvailable = false;
      }
    } else {
      this.isRedisAvailable = false;
    }
  }

  public async get<T>(key: string, options?: AICacheOptions): Promise<T | null> {
    const startTime = Date.now();
    const resolvedNamespace = options?.namespace || this.namespace;
    const namespacedKey = `${resolvedNamespace}:${key}`;

    if (!featureFlags.CACHE_ENABLED) {
      return null;
    }

    try {
      if (this.isRedisAvailable && this.client) {
        const val = await this.client.get(namespacedKey);
        const latencyMs = Date.now() - startTime;

        if (val) {
          this.publishEvent('hit', key, resolvedNamespace, latencyMs, options);
          return JSON.parse(val) as T;
        } else {
          this.publishEvent('miss', key, resolvedNamespace, latencyMs, options);
          return null;
        }
      }
    } catch (err) {
      this.isRedisAvailable = false;
    }

    // Memory Cache Fallback
    const now = Date.now();
    const cached = this.memoryCache.get(namespacedKey);
    const latencyMs = Date.now() - startTime;

    if (cached && cached.expiry > now) {
      this.publishEvent('hit', key, resolvedNamespace, latencyMs, options);
      return cached.value as T;
    } else {
      if (cached) {
        this.memoryCache.delete(namespacedKey); // prune expired
      }
      this.publishEvent('miss', key, resolvedNamespace, latencyMs, options);
      return null;
    }
  }

  public async set<T>(key: string, value: T, options?: AICacheOptions): Promise<void> {
    const startTime = Date.now();
    const resolvedNamespace = options?.namespace || this.namespace;
    const namespacedKey = `${resolvedNamespace}:${key}`;
    const ttl = options?.ttlSeconds ?? featureFlags.CACHE_DEFAULT_TTL;

    if (!featureFlags.CACHE_ENABLED) {
      return;
    }

    try {
      if (this.isRedisAvailable && this.client) {
        await this.client.set(namespacedKey, JSON.stringify(value), 'EX', ttl);
        const latencyMs = Date.now() - startTime;
        this.publishEvent('set', key, resolvedNamespace, latencyMs, options);
        return;
      }
    } catch (err) {
      this.isRedisAvailable = false;
    }

    // Memory Cache Fallback
    this.pruneMemoryCache();
    if (this.memoryCache.size >= 1000) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey !== undefined) {
        this.memoryCache.delete(firstKey);
      }
    }

    const expiry = Date.now() + ttl * 1000;
    this.memoryCache.set(namespacedKey, { value, expiry });
    const latencyMs = Date.now() - startTime;
    this.publishEvent('set', key, resolvedNamespace, latencyMs, options);
  }

  public async delete(key: string, options?: AICacheOptions): Promise<void> {
    const startTime = Date.now();
    const resolvedNamespace = options?.namespace || this.namespace;
    const namespacedKey = `${resolvedNamespace}:${key}`;

    try {
      if (this.isRedisAvailable && this.client) {
        await this.client.del(namespacedKey);
      }
    } catch (err) {
      this.isRedisAvailable = false;
    }

    this.memoryCache.delete(namespacedKey);
    const latencyMs = Date.now() - startTime;
    this.publishEvent('invalidation', key, resolvedNamespace, latencyMs, options);
  }

  public async clear(): Promise<void> {
    try {
      if (this.isRedisAvailable && this.client) {
        await this.client.flushdb();
      }
    } catch (err) {
      this.isRedisAvailable = false;
    }
    this.memoryCache.clear();
  }

  private pruneMemoryCache() {
    const now = Date.now();
    for (const [k, v] of this.memoryCache.entries()) {
      if (v.expiry < now) {
        this.memoryCache.delete(k);
      }
    }
  }

  private publishEvent(
    action: 'hit' | 'miss' | 'set' | 'invalidation',
    key: string,
    namespace: string,
    latencyMs: number,
    options?: AICacheOptions
  ) {
    traceEventBus.publish({
      traceId: options?.traceId || '',
      requestId: options?.requestId || '',
      stage: 'cache',
      component: 'AICache',
      status: 'completed',
      latencyMs,
      metadata: {
        action,
        key,
        namespace,
        tenantId: options?.tenantId,
        workspaceId: options?.workspaceId
      }
    });
  }
}

export const cacheService = new DefaultAICache();
