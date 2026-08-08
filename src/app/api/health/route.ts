import { NextResponse } from 'next/server';
import pg from 'pg';
import Redis from 'ioredis';

export async function GET() {
  const status: Record<string, 'connected' | 'disconnected'> = {
    postgres: 'disconnected',
    redis: 'disconnected',
    langfuse: 'disconnected',
    providers: 'disconnected'
  };

  let overallStatus = 'healthy';

  // 1. PostgreSQL check
  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl) {
    try {
      const pool = new pg.Pool({
        connectionString: dbUrl,
        connectionTimeoutMillis: 1000,
        ssl: dbUrl.includes('neon') ? { rejectUnauthorized: false } : undefined
      });
      const result = await Promise.race([
        pool.query('SELECT 1'),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('PostgreSQL check timed out')), 1000))
      ]);
      if (result) {
        status.postgres = 'connected';
      }
      await pool.end().catch(() => {});
    } catch (err) {
      overallStatus = 'degraded';
      console.error("[HealthCheck] Postgres connection failed:", err instanceof Error ? err.message : err);
    }
  }

  // 2. Redis check
  const redisUrl = process.env.REDIS_URL || '';
  if (redisUrl) {
    try {
      const client = new Redis(redisUrl, {
        maxRetriesPerRequest: 0,
        connectTimeout: 1000
      });
      const ping = await Promise.race([
        client.ping(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Redis check timed out')), 1000))
      ]);
      if (ping === 'PONG') {
        status.redis = 'connected';
      }
      await client.quit().catch(() => {});
    } catch (err) {
      overallStatus = 'degraded';
      console.error("[HealthCheck] Redis connection failed:", err instanceof Error ? err.message : err);
    }
  }

  // 3. Langfuse check
  const langfusePublicKey = process.env.LANGFUSE_PUBLIC_KEY || process.env.NEXT_PUBLIC_LANGFUSE_PUBLIC_KEY || '';
  const langfuseSecretKey = process.env.LANGFUSE_SECRET_KEY || '';
  if (langfusePublicKey && langfuseSecretKey) {
    status.langfuse = 'connected';
  } else {
    overallStatus = 'degraded';
  }

  // 4. AI Providers connectivity checks
  const hasGemini = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  if (hasGemini || hasOpenAI || hasAnthropic) {
    status.providers = 'connected';
  } else {
    overallStatus = 'degraded';
  }

  if (overallStatus === 'degraded' && status.postgres === 'disconnected' && status.redis === 'disconnected') {
    overallStatus = 'unhealthy';
  }

  return NextResponse.json({
    status: overallStatus,
    components: status
  });
}
