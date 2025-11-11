import Redis, { type RedisOptions } from "ioredis";
import { logger } from "@/utils/logger";

/**
 * RedisService - Singleton service for Redis connection management
 * Handles connection pooling metadata, TTL-based cleanup, and coordination
 */
class RedisService {
  private static instance: RedisService;
  private client: Redis | null = null;
  private isConnected = false;

  private constructor() {}

  /**
   * Get singleton instance of RedisService
   */
  static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  /**
   * Initialize Redis connection with retry logic
   */
  async connect(config?: RedisOptions): Promise<void> {
    if (this.isConnected && this.client) {
      logger.debug("Redis client already connected");
      return;
    }

    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const password = process.env.REDIS_PASSWORD;

    const options: RedisOptions = {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn({ attempt: times, delay }, "Retrying Redis connection");
        return delay;
      },
      enableReadyCheck: true,
      lazyConnect: false,
      ...config,
    };

    if (password) {
      options.password = password;
    }

    try {
      this.client = new Redis(redisUrl, options);

      this.client.on("connect", () => {
        logger.info("Redis client connecting...");
      });

      this.client.on("ready", () => {
        this.isConnected = true;
        logger.info("Redis client connected and ready");
      });

      this.client.on("error", (error: Error) => {
        logger.error({ error }, "Redis client error");
      });

      this.client.on("close", () => {
        this.isConnected = false;
        logger.warn("Redis connection closed");
      });

      this.client.on("reconnecting", () => {
        logger.info("Redis client reconnecting...");
      });

      // Wait for connection to be ready
      await this.client.ping();
      logger.info("Redis connection established successfully");
    } catch (error) {
      logger.error({ error }, "Failed to connect to Redis");
      throw new Error("Redis connection failed");
    }
  }

  /**
   * Get the Redis client instance
   */
  getClient(): Redis {
    if (!(this.client && this.isConnected)) {
      throw new Error("Redis client not connected. Call connect() first.");
    }
    return this.client;
  }

  /**
   * Check if Redis is connected
   */
  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Store pool metadata with TTL
   */
  async setPoolMetadata(
    key: string,
    metadata: Record<string, unknown>,
    ttlSeconds?: number
  ): Promise<void> {
    const client = this.getClient();
    const serialized = JSON.stringify(metadata);

    if (ttlSeconds) {
      await client.setex(key, ttlSeconds, serialized);
      logger.debug({ key, ttl: ttlSeconds }, "Stored pool metadata with TTL");
    } else {
      await client.set(key, serialized);
      logger.debug({ key }, "Stored pool metadata without TTL");
    }
  }

  /**
   * Get pool metadata
   */
  async getPoolMetadata(key: string): Promise<Record<string, unknown> | null> {
    const client = this.getClient();
    const data = await client.get(key);

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data);
    } catch (error) {
      logger.error({ error, key }, "Failed to parse pool metadata");
      return null;
    }
  }

  /**
   * Delete pool metadata
   */
  async deletePoolMetadata(key: string): Promise<void> {
    const client = this.getClient();
    await client.del(key);
    logger.debug({ key }, "Deleted pool metadata");
  }

  /**
   * Get all pool keys for a user
   */
  async getUserPoolKeys(userId: string): Promise<string[]> {
    const client = this.getClient();
    const pattern = `pool:${userId}:*`;
    const keys = await client.keys(pattern);
    return keys;
  }

  /**
   * Delete all pool keys for a user
   */
  async deleteUserPools(userId: string): Promise<number> {
    const keys = await this.getUserPoolKeys(userId);
    if (keys.length === 0) {
      return 0;
    }

    const client = this.getClient();
    const deleted = await client.del(...keys);
    logger.info({ userId, deleted }, "Deleted user pool metadata");
    return deleted;
  }

  /**
   * Set pool connection status
   */
  async setPoolStatus(
    poolKey: string,
    status: "active" | "idle" | "error",
    ttlSeconds?: number
  ): Promise<void> {
    const statusKey = `${poolKey}:status`;
    const client = this.getClient();

    if (ttlSeconds) {
      await client.setex(statusKey, ttlSeconds, status);
    } else {
      await client.set(statusKey, status);
    }

    logger.debug({ poolKey, status }, "Updated pool status");
  }

  /**
   * Get pool connection status
   */
  async getPoolStatus(
    poolKey: string
  ): Promise<"active" | "idle" | "error" | null> {
    const statusKey = `${poolKey}:status`;
    const client = this.getClient();
    const status = await client.get(statusKey);
    return status as "active" | "idle" | "error" | null;
  }

  /**
   * Increment pool usage counter
   */
  async incrementPoolUsage(poolKey: string): Promise<number> {
    const usageKey = `${poolKey}:usage`;
    const client = this.getClient();
    const count = await client.incr(usageKey);
    return count;
  }

  /**
   * Get pool usage count
   */
  async getPoolUsage(poolKey: string): Promise<number> {
    const usageKey = `${poolKey}:usage`;
    const client = this.getClient();
    const count = await client.get(usageKey);
    return count ? Number.parseInt(count, 10) : 0;
  }

  /**
   * Set TTL for existing key
   */
  async setTTL(key: string, ttlSeconds: number): Promise<void> {
    const client = this.getClient();
    await client.expire(key, ttlSeconds);
    logger.debug({ key, ttl: ttlSeconds }, "Set TTL for key");
  }

  /**
   * Get TTL for a key
   */
  async getTTL(key: string): Promise<number> {
    const client = this.getClient();
    return await client.ttl(key);
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const client = this.getClient();
    const exists = await client.exists(key);
    return exists === 1;
  }

  /**
   * Gracefully disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      logger.info("Disconnecting Redis client...");
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      logger.info("Redis client disconnected");
    }
  }

  /**
   * Force disconnect (for emergency cleanup)
   */
  forceDisconnect(): void {
    if (this.client) {
      logger.warn("Force disconnecting Redis client");
      this.client.disconnect();
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * Flush all data (use with caution, mainly for testing)
   */
  async flushAll(): Promise<void> {
    const client = this.getClient();
    await client.flushall();
    logger.warn("Flushed all Redis data");
  }
}

// Export singleton instance
export const redisService = RedisService.getInstance();
