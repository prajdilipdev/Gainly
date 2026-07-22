import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

/**
 * Cache abstraction backed by Redis when REDIS_URL is configured,
 * falling back to a bounded in-memory store otherwise (single-node dev).
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private readonly memory = new Map<string, MemoryEntry>();
  private static readonly MEMORY_MAX_KEYS = 5000;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    if (url) {
      this.redis = new Redis(url, {
        lazyConnect: false,
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
        retryStrategy: (times) => Math.min(times * 500, 10_000),
      });
      this.redis.on('error', (err) =>
        this.logger.warn(`Redis error: ${err.message}`),
      );
      this.logger.log('Cache backend: Redis');
    } else {
      this.logger.warn('REDIS_URL not set — using in-memory cache fallback');
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.redis && this.redis.status === 'ready') {
        const raw = await this.redis.get(key);
        return raw ? (JSON.parse(raw) as T) : null;
      }
    } catch {
      // fall through to memory
    }
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const raw = JSON.stringify(value);
    try {
      if (this.redis && this.redis.status === 'ready') {
        await this.redis.set(key, raw, 'EX', ttlSeconds);
        return;
      }
    } catch {
      // fall through to memory
    }
    if (this.memory.size >= CacheService.MEMORY_MAX_KEYS) {
      const oldest = this.memory.keys().next().value;
      if (oldest !== undefined) this.memory.delete(oldest);
    }
    this.memory.set(key, { value: raw, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    try {
      if (this.redis && this.redis.status === 'ready') {
        await this.redis.del(key);
      }
    } catch {
      // ignore
    }
    this.memory.delete(key);
  }

  async onModuleDestroy() {
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }
}
