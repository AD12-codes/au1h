import Redis, { type RedisOptions } from "ioredis";
import { logger } from "@/utils/logger";

/**
 * RedisService - Singleton service for Redis connection management
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
