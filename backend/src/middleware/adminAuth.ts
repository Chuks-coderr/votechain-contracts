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
 * Admin JWT authentication middleware for VoteChain backend API.
 *
 * Usage:
 *   import { adminAuth } from "./adminAuth";
 *   router.post("/proposals/invalidate", adminAuth, handler);
 *
 * Environment variables:
 *   ADMIN_JWT_SECRET       Secret used to verify tokens (default: "changeme")
 *   ADMIN_STELLAR_ADDRESS  The on-chain admin Stellar address that must appear in the token payload
 *
 * Token format:
 *   JWT signed with HMAC-SHA256, payload: { stellarAddress: string }
 *   Passed via: Authorization: Bearer <token>
 *
 * Rate limiting:
 *   Max 10 requests per minute per IP (in-memory, resets per window)
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// ── Types ──────────────────────────────────────────────────────────────────

interface AdminTokenPayload {
  stellarAddress: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number; // Unix epoch ms
}

// ── Rate limiter state ─────────────────────────────────────────────────────

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

const rateLimitMap = new Map<string, RateLimitEntry>();

/**
 * Returns true if the request from the given IP is within rate limits,
 * increments the counter, and returns false if the limit has been exceeded.
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now >= entry.resetAt) {
    // First request in this window (or window has expired)
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  entry.count += 1;

  if (entry.count > RATE_LIMIT_MAX) {
    return false;
  }

  return true;
}

// ── Middleware ─────────────────────────────────────────────────────────────

/**
 * Express middleware that:
 * 1. Applies a per-IP rate limit (10 req/min)
 * 2. Validates the JWT from the Authorization: Bearer header
 * 3. Verifies the stellarAddress in the payload matches ADMIN_STELLAR_ADDRESS
 *
 * Calls next() only when all checks pass.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  // ── Step 1: Rate limiting ──────────────────────────────────────────────
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";

  if (!checkRateLimit(ip)) {
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests",
        details: [],
      },
    });
    return;
  }

  // ── Step 2: Extract token ──────────────────────────────────────────────
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing Authorization header",
        details: [],
      },
    });
    return;
  }

  const token = authHeader.slice("Bearer ".length);

  // ── Step 3: Verify JWT ─────────────────────────────────────────────────
  const secret = process.env.ADMIN_JWT_SECRET ?? "changeme";
  let payload: AdminTokenPayload;

  try {
    payload = jwt.verify(token, secret) as AdminTokenPayload;
  } catch {
    res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "Invalid or expired token",
        details: [],
      },
    });
    return;
  }

  // ── Step 4: Verify stellarAddress matches admin ────────────────────────
  const adminAddress = process.env.ADMIN_STELLAR_ADDRESS;

  if (!adminAddress || payload.stellarAddress !== adminAddress) {
    res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "Caller is not the on-chain admin",
        details: [],
      },
    });
    return;
  }

  // ── All checks passed ──────────────────────────────────────────────────
  next();
}
