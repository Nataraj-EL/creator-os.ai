import { RateLimiter } from './types';

export class InMemoryRateLimiter implements RateLimiter {
  private requests: Map<string, number[]> = new Map();

  public async limit(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    let timestamps = this.requests.get(key) || [];

    const cutoff = now - windowMs;
    timestamps = timestamps.filter(t => t > cutoff);

    const resetTime = timestamps.length > 0 ? timestamps[0] + windowMs : now + windowMs;

    if (timestamps.length >= limit) {
      this.requests.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        resetTime
      };
    }

    timestamps.push(now);
    this.requests.set(key, timestamps);

    return {
      allowed: true,
      remaining: limit - timestamps.length,
      resetTime
    };
  }

  public clear(): void {
    this.requests.clear();
  }
}
