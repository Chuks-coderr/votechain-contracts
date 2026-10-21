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
 * Tiered rate-limit middleware for VoteChain.
 *
 * Two tiers:
 *   anon     — 100 read / 10 write per minute per IP
 *   api_key  — 1000 read / 100 write per minute per key ID
 *
 * READ methods:  GET, HEAD, OPTIONS
 * WRITE methods: POST, PUT, PATCH, DELETE
 *
 * Redis key layout:
 *   rate-limit:<tier-id>:read   (TTL = 60 s)
 *   rate-limit:<tier-id>:write  (TTL = 60 s)
 *
 * Abuse detection (api_key tier):
 *   If a key's 1-minute request count exceeds ABUSE_BURST_THRESHOLD (default
 *   1500 req/min across read + write combined), it is automatically suspended
 *   by calling suspendApiKey().  The suspension is permanent until an admin
 *   calls the reinstate endpoint.
 *
 * Fallback: if Redis is unavailable all requests are passed through and
 * remaining headers report the configured maximum (degraded-graceful).
 */

import { Request, Response, NextFunction } from "express";
import { getRedis } from "./redisCache";
import { suspendApiKey } from "../services/apiKeyService";
import { log } from "./requestTracing";

// ── Tier limits ─────────────────────────────────────────────────────────────

const WINDOW_SECONDS = 60;

const LIMITS = {
  anon: {
    read: Number(process.env.ANON_READ_LIMIT ?? 100),
    write: Number(process.env.ANON_WRITE_LIMIT ?? 10),
  },
  api_key: {
    read: Number(process.env.API_KEY_READ_LIMIT ?? 1000),
    write: Number(process.env.API_KEY_WRITE_LIMIT ?? 100),
  },
} as const;

/**
 * Combined burst threshold above which a key is auto-suspended.
 * Default: 1500 req/min (50 % above the 1000-read limit).
 */
const ABUSE_BURST_THRESHOLD = Number(
  process.env.ABUSE_BURST_THRESHOLD ?? 1500
);

// ── Helpers ──────────────────────────────────────────────────────────────────

type HttpMethod = "read" | "write";

function methodType(method: string): HttpMethod {
  const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  return writeMethods.has(method.toUpperCase()) ? "write" : "read";
}

/** Returns the scope key used for rate-limit Redis counters. */
function rateLimitKey(tierId: string, type: HttpMethod): string {
  return `rate-limit:${tierId}:${type}`;
}

/**
 * Returns a combined key for abuse detection (reads + writes in the same
 * window for a given API key).
 */
function abuseKey(keyId: string): string {
  return `rate-limit:${keyId}:abuse`;
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Express middleware that enforces per-tier rate limits.
 *
 * Must be applied AFTER apiKeyAuth so that req.apiKeyTier is already set.
 */
export async function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const tier = req.apiKeyTier ?? "anon";
  const type = methodType(req.method);
  const limits = LIMITS[tier];
  const maximum = limits[type];
  const reset = Math.ceil(Date.now() / 1000) + WINDOW_SECONDS;

  res.setHeader("X-RateLimit-Tier", tier);
  res.setHeader("X-RateLimit-Limit", maximum);
  res.setHeader("X-RateLimit-Reset", reset);

  const redis = getRedis();
  if (!redis?.isOpen) {
    // Degrade gracefully — admit the request without counting
    res.setHeader("X-RateLimit-Remaining", maximum);
    return next();
  }

  // Choose scope: api_key uses key ID, anon uses IP
  const tierId =
    tier === "api_key" && req.apiKeyMeta
      ? `key:${req.apiKeyMeta.id}`
      : `ip:${req.ip}`;

  const rlKey = rateLimitKey(tierId, type);

  try {
    const count = await redis.incr(rlKey);
    if (count === 1) await redis.expire(rlKey, WINDOW_SECONDS);

    const remaining = Math.max(0, maximum - count);
    res.setHeader("X-RateLimit-Remaining", remaining);

    if (count > maximum) {
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: `Too many ${type} requests. Limit: ${maximum}/min.`,
          details: [],
        },
      });
      return;
    }

    // ── Abuse detection for api_key tier ──────────────────────────────────
    if (tier === "api_key" && req.apiKeyMeta) {
      const keyId = req.apiKeyMeta.id;
      const abKey = abuseKey(keyId);

      const totalCount = await redis.incr(abKey);
      if (totalCount === 1) await redis.expire(abKey, WINDOW_SECONDS);

      if (totalCount > ABUSE_BURST_THRESHOLD) {
        log("warn", "abuse threshold exceeded — suspending key", {
          keyId,
          totalCount,
          threshold: ABUSE_BURST_THRESHOLD,
        });
        // Suspend the key asynchronously — don't block the current response
        suspendApiKey(keyId).catch((err) =>
          log("error", "failed to auto-suspend key", {
            keyId,
            error: String(err),
          })
        );
        // The current request still gets through; the key is blocked on the
        // *next* request after the apiKeyAuth middleware sees "suspended".
      }
    }
  } catch (err) {
    log("error", "rateLimit redis error", { error: String(err) });
    // Degrade gracefully on Redis error
    res.setHeader("X-RateLimit-Remaining", maximum);
  }

  next();
}
