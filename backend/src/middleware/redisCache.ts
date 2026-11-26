// Copyright 2024 VoteChain Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Redis caching middleware for VoteChain backend API.
 *
 * TTLs:
 *   - Proposal list  → 30 seconds
 *   - Single proposal → 10 seconds
 *
 * Resilience (#38):
 *   - If Redis is unreachable at startup the server still starts; caching is
 *     simply bypassed until Redis comes back.
 *   - Exponential backoff reconnection with a maximum of 5 retries.
 *   - After a successful reconnection caching resumes automatically.
 *   - Cache degradation is visible via GET /metrics/cache (redis_up field).
 *
 * Cache-hit/miss metrics are tracked in memory and exposed via that same
 * endpoint. Cache invalidation is triggered by invalidateProposalCache(id?).
 */

import { getConfig } from "../config";
import { createClient, RedisClientType } from "redis";
import { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { log } from "./requestTracing";

// ── Redis client ───────────────────────────────────────────────────────────

let redis: RedisClientType | null = null;
let redisUp = false;

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 500;

export function getRedis() {
  return redis;
}

/**
 * Returns true when the Redis client is connected and ready to accept
 * commands. Used by the /ready health-check endpoint.
 */
export function isRedisReady(): boolean {
  return redisUp && !!redis?.isOpen;
}

// ── Reconnect with exponential backoff ────────────────────────────────────

async function reconnectWithBackoff(url: string, attempt = 1): Promise<void> {
  if (attempt > MAX_RETRIES) {
    log("warn", "redis max retries reached — running without cache", {
      maxRetries: MAX_RETRIES,
    });
    return;
  }

  const delay = BASE_DELAY_MS * 2 ** (attempt - 1); // 500, 1000, 2000, 4000, 8000 ms
  log("warn", `redis reconnect attempt ${attempt}/${MAX_RETRIES} in ${delay}ms`);

  await new Promise((resolve) => setTimeout(resolve, delay));

  try {
    await attemptConnect(url);
  } catch {
    await reconnectWithBackoff(url, attempt + 1);
  }
}

async function attemptConnect(url: string): Promise<void> {
  const client = createClient({ url }) as RedisClientType;

  client.on("error", (err) => {
    log("error", "redis error", { error: String(err) });
    redisUp = false;
  });

  client.on("reconnecting", () => {
    log("info", "redis reconnecting…");
    redisUp = false;
  });

  client.on("ready", () => {
    log("info", "redis ready");
    redisUp = true;
  });

  await client.connect();

  redis = client;
  redisUp = true;
  log("info", "redis connected", { url });
}

/**
 * Connect to Redis on startup. (#38)
 *
 * If the initial connection fails the server continues without caching.
 * Background reconnect attempts run with exponential backoff (max 5).
 */
export async function connectRedis(
  url = getConfig().redisUrl ?? "redis://localhost:6379"
): Promise<void> {
  try {
    await attemptConnect(url);
  } catch (err) {
    log("warn", "redis unavailable at startup — starting without cache", {
      error: String(err),
    });
    redisUp = false;
    // Kick off background reconnect attempts; don't await — let server start.
    reconnectWithBackoff(url, 1).catch(() => {
      /* background — errors already logged inside */
    });
  }
}

// ── Metrics ────────────────────────────────────────────────────────────────

const metrics = { hits: 0, misses: 0, invalidations: 0 };

export function getCacheMetrics() {
  const total = metrics.hits + metrics.misses;
  return {
    ...metrics,
    hitRate: total === 0 ? 0 : metrics.hits / total,
    missRate: total === 0 ? 0 : metrics.misses / total,
    /** Reflects current Redis connectivity (#38) */
    redis_up: isRedisReady(),
  };
}

// ── TTL constants ──────────────────────────────────────────────────────────

const TTL = {
  PROPOSAL_LIST: getConfig().proposalListTtl,
  PROPOSAL_ITEM: getConfig().proposalItemTtl,
};

export const LEADERBOARD_CACHE_TTL_SECONDS = getConfig().leaderboardCacheTtl;

if (
  !Number.isSafeInteger(LEADERBOARD_CACHE_TTL_SECONDS) ||
  LEADERBOARD_CACHE_TTL_SECONDS <= 0
) {
  throw new Error("LEADERBOARD_CACHE_TTL must be a positive integer.");
}

// ── Cache key helpers ──────────────────────────────────────────────────────

const KEY = {
  list: (req: Request) => `proposals:list:${req.originalUrl}`,
  item: (id: string | number) => `proposals:item:${id}`,
};

// ── ETag helpers ───────────────────────────────────────────────────────────

/**
 * Compute a deterministic, strong ETag for a serialized response body.
 * Uses SHA-256 of the payload so identical bodies always yield the same tag.
 */
export function computeEtag(serialized: string): string {
  const hash = createHash("sha256").update(serialized).digest("hex");
  return `"${hash}"`;
}

/**
 * Returns true when the request's If-None-Match header matches the given
 * ETag. Handles comma-separated lists, the wildcard `*`, and weak validators
 * (`W/"..."`).
 */
export function ifNoneMatchMatches(
  header: string | string[] | undefined,
  etag: string
): boolean {
  if (!header) return false;
  const raw = Array.isArray(header) ? header.join(",") : header;
  const normalized = etag.replace(/^W\//, "");
  return raw
    .split(",")
    .map((t) => t.trim())
    .some((t) => t === "*" || t.replace(/^W\//, "") === normalized);
}

// ── Middleware factory ─────────────────────────────────────────────────────

/**
 * Returns an Express middleware that caches the JSON response in Redis.
 * Falls through to the next handler when Redis is down (#38).
 *
 * @param keyFn   Function that derives the cache key from the request.
 * @param ttl     TTL in seconds.
 */
function cacheMiddleware(keyFn: (req: Request) => string, ttl: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Bypass cache entirely when Redis is unavailable (#38)
    if (!isRedisReady() || !redis) {
      res.setHeader("X-Cache", "BYPASS");
      return next();
    }

    const key = keyFn(req);
    try {
      const cached = await redis.get(key);
      if (cached !== null) {
        metrics.hits++;
        res.setHeader("X-Cache", "HIT");
        const etag = computeEtag(cached);
        res.setHeader("ETag", etag);
        if (ifNoneMatchMatches(req.headers["if-none-match"], etag)) {
          res.status(304).end();
          return;
        }
        res.setHeader("Content-Type", "application/json");
        return res.send(cached);
      }
    } catch (err) {
      log("error", "redis get error", { error: String(err) });
      // Fall through on error — degrade gracefully
      res.setHeader("X-Cache", "BYPASS");
      return next();
    }

    metrics.misses++;
    res.setHeader("X-Cache", "MISS");

    // Intercept res.json to store the response in Redis
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      // Never cache errors: a hit would replay them with status 200.
      if (res.statusCode === 200 && isRedisReady() && redis) {
        const serialized = JSON.stringify(body);
        redis.setEx(key, ttl, serialized).catch((err) =>
          log("error", "redis setEx error", { error: String(err) })
        );
      }
      return originalJson(body);
    };

    next();
  };
}

/** Middleware for GET /proposals — 30-second TTL */
export const cacheProposalList = cacheMiddleware(
  (req) => KEY.list(req),
  TTL.PROPOSAL_LIST
);

/** Middleware for GET /proposals/:id — 10-second TTL */
export const cacheProposalItem = cacheMiddleware(
  (req) => KEY.item(req.params.id),
  TTL.PROPOSAL_ITEM
);

export const cacheLeaderboardResponse = cacheMiddleware(
  (req) => `leaderboard:response:${req.originalUrl}`,
  LEADERBOARD_CACHE_TTL_SECONDS,
);

// ── Cache invalidation ─────────────────────────────────────────────────────

/**
 * Invalidate cache entries.
 * - No argument: clears the proposal list cache.
 * - With id: clears both the list and the specific item cache.
 *
 * No-ops when Redis is unavailable.
 */
export async function invalidateProposalCache(
  id?: string | number
): Promise<void> {
  if (!isRedisReady() || !redis) return;
  const keys: string[] = [];
  for await (const key of redis.scanIterator({ MATCH: "proposals:list*" })) {
    keys.push(key);
  }
  if (id !== undefined) keys.push(KEY.item(id));
  try {
    if (keys.length > 0) await redis.del(keys);
    metrics.invalidations++;
    log("info", "redis cache invalidated", { keys });
  } catch (err) {
    log("error", "redis del error", { error: String(err) });
  }
}
