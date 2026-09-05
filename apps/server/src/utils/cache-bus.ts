import type Redis from "ioredis";
import { logger } from "@/utils/logger";
import { redisService } from "@/utils/redis";

/**
 * Cross-instance cache invalidation.
 *
 * Several small read caches (application origins, proxy routes, slug lookups)
 * live in process memory with a short TTL. When one instance changes the
 * underlying rows it publishes the topic here; every instance, including the
 * publisher, clears its local copy. Redis pub/sub needs a dedicated
 * subscriber connection, created lazily from the main client.
 */
const CHANNEL = "au1h:cache-invalidate";

export type CacheTopic = "applications" | "routes";

const listeners = new Map<CacheTopic, Set<() => void>>();
let subscriber: Redis | null = null;

function ensureSubscriber() {
  if (subscriber || !redisService.isReady()) {
    return;
  }
  subscriber = redisService.getClient().duplicate();
  subscriber.on("error", (error) => {
    logger.error({ error }, "Cache-bus subscriber error");
  });
  subscriber.subscribe(CHANNEL).catch((error) => {
    logger.error({ error }, "Cache-bus subscribe failed");
  });
  subscriber.on("message", (_channel, message) => {
    const topic = message as CacheTopic;
    for (const fn of listeners.get(topic) ?? []) {
      fn();
    }
    logger.debug({ topic }, "Cache invalidated via bus");
  });
}

/** Register a local cache clearer for a topic. */
export function onCacheInvalidate(topic: CacheTopic, clear: () => void): void {
  const set = listeners.get(topic) ?? new Set();
  set.add(clear);
  listeners.set(topic, set);
  ensureSubscriber();
}

/**
 * Invalidate a topic everywhere. Clears locally right away (so the current
 * instance is consistent even if Redis is down) and publishes to the others.
 */
export function invalidateCache(topic: CacheTopic): void {
  for (const fn of listeners.get(topic) ?? []) {
    fn();
  }
  if (!redisService.isReady()) {
    return;
  }
  redisService
    .getClient()
    .publish(CHANNEL, topic)
    .catch((error) => {
      logger.warn({ error, topic }, "Cache-bus publish failed");
    });
}
