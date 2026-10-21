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
 * API key authentication middleware for VoteChain's verified-DAO tier.
 *
 * Usage:
 *   Apply BEFORE the rateLimit middleware so that the tier is known when
 *   rate-limit counters are looked up.
 *
 *   import { apiKeyAuth } from "./apiKeyAuth";
 *   app.use(apiKeyAuth);
 *   app.use(rateLimit);
 *
 * Behaviour:
 *   - If no Authorization header is present → tier "anon", continue.
 *   - If Authorization: Bearer <token> is present:
 *       • If token starts with "vc_"  → treated as an API key:
 *           - Resolved via resolveApiKey()
 *           - If not found  → 401 INVALID_API_KEY
 *           - If suspended  → 403 SUSPENDED_KEY
 *           - If revoked    → 401 REVOKED_KEY
 *           - Otherwise     → tier "api_key", attach meta to req
 *       • Otherwise → treated as an admin JWT (passed through for adminAuth)
 *
 * The middleware never blocks unauthenticated requests — anonymous access is
 * permitted at a lower rate limit.  Route handlers that need a key can check
 * req.apiKeyTier === "api_key" themselves.
 *
 * Type augmentation (for TypeScript consumers):
 *   See module augmentation at the bottom of this file.
 */

import { Request, Response, NextFunction } from "express";
import { resolveApiKey, ApiKeyMeta } from "../services/apiKeyService";
import { log } from "./requestTracing";

// ── Tier definition ─────────────────────────────────────────────────────────

export type ApiKeyTier = "anon" | "api_key";

// ── Express request augmentation ────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      /** Populated by apiKeyAuth middleware. */
      apiKeyTier: ApiKeyTier;
      /** Set when apiKeyTier === "api_key". */
      apiKeyMeta?: ApiKeyMeta;
    }
  }
}

// ── Middleware ───────────────────────────────────────────────────────────────

/**
 * Identifies whether the request carries a valid DAO API key and attaches
 * the resolved tier and metadata to the request object.
 *
 * Never throws — all errors are serialised as JSON responses.
 */
export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Default: anonymous tier
  req.apiKeyTier = "anon";

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.slice("Bearer ".length).trim();

  // Only tokens that start with "vc_" are API keys.
  // All other Bearer tokens fall through (handled by adminAuth).
  if (!token.startsWith("vc_")) {
    return next();
  }

  // Resolve the API key
  let meta: ApiKeyMeta | null;
  try {
    meta = await resolveApiKey(token);
  } catch (err) {
    log("error", "apiKeyAuth: resolveApiKey threw", { error: String(err) });
    // Degrade gracefully — treat as anonymous if Redis is down
    return next();
  }

  if (!meta) {
    res.status(401).json({
      error: {
        code: "INVALID_API_KEY",
        message: "Unknown API key",
        details: [],
      },
    });
    return;
  }

  if (meta.status === "revoked") {
    res.status(401).json({
      error: {
        code: "REVOKED_KEY",
        message: "This API key has been revoked",
        details: [],
      },
    });
    return;
  }

  if (meta.status === "suspended") {
    res.status(403).json({
      error: {
        code: "SUSPENDED_KEY",
        message:
          "This API key has been suspended due to anomalous traffic. " +
          "Contact support to reinstate it.",
        details: [],
      },
    });
    return;
  }

  // Valid active key
  req.apiKeyTier = "api_key";
  req.apiKeyMeta = meta;
  next();
}
