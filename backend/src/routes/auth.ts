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
 * Admin authentication token issuance and refresh.
 *
 * POST   /api/auth/login    — issue a short-lived access JWT + refresh JWT
 *                                (requires the on-chain admin stellar address)
 * POST   /api/auth/refresh  — exchange a valid refresh JWT for a new access
 *                                JWT, within the refresh window.
 *
 * Access tokens are short-lived (ADMIN_JWT_ACCESS_TTL_MS, default 15 min).
 * Refresh tokens live longer (ADMIN_JWT_REFRESH_TTL_MS, default 7 days) and
 * are held in an in-memory store so they can be revoked/rotated.
 *
 * Route is intentionally mounted BEFORE apiKeyAuth/rateLimit so auth can
 * bootstrap without an existing API key.
 */

import { Router, Request, Response } from "express";
import jwt, { SignOptions } from "jsonwebtoken";
import { getConfig } from "../config";

const router = Router();

// ── Types ──────────────────────────────────────────────────────────────────

interface AccessTokenPayload {
  stellarAddress: string;
  type: "access";
}

interface RefreshTokenPayload {
  stellarAddress: string;
  type: "refresh";
}

interface RefreshEntry {
  stellarAddress: string;
  issuedAt: number;
  expiresAt: number;
}

// ── In-memory refresh token store ──────────────────────────────────────────

const refreshStore = new Map<string, RefreshEntry>();

/** Test-only: clear all refresh tokens. Exported for tests. */
export function _clearRefreshStoreForTesting(): void {
  refreshStore.clear();
}

/** Test-only: snapshot of refresh store. Exported for tests. */
export function _getRefreshStoreForTesting(): Map<string, RefreshEntry> {
  return new Map(refreshStore);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function signToken(
  payload: object,
  secret: string,
  ttlMs: number
): string {
  const options: SignOptions = {
    expiresIn: Math.floor(ttlMs / 1000),
    issuer: "votechain",
  };
  return jwt.sign(payload, secret, options);
}

function verifyToken<T extends object>(token: string, secret: string): T {
  return jwt.verify(token, secret, { issuer: "votechain" }) as T;
}

// ── POST /api/auth/login ─────────────────────────────────────────────────

router.post("/login", (req: Request, res: Response) => {
  const config = getConfig();

  const { stellarAddress } = req.body as { stellarAddress?: unknown };

  if (typeof stellarAddress !== "string" || stellarAddress.trim().length === 0) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "stellarAddress is required",
        details: [],
      },
    });
  }

  const adminAddress = config.ADMIN_STELLAR_ADDRESS;
  if (!adminAddress || stellarAddress.trim() !== adminAddress) {
    return res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "Caller is not the on-chain admin",
        details: [],
      },
    });
  }

  const address = stellarAddress.trim();
  const accessToken = signToken(
    { stellarAddress: address, type: "access" },
    config.ADMIN_JWT_SECRET,
    config.ADMIN_JWT_ACCESS_TTL_MS
  );
  const refreshToken = signToken(
    { stellarAddress: address, type: "refresh" },
    config.ADMIN_JWT_SECRET,
    config.ADMIN_JWT_REFRESH_TTL_MS
  );

  const now = Date.now();
  refreshStore.set(refreshToken, {
    stellarAddress: address,
    issuedAt: now,
    expiresAt: now + config.ADMIN_JWT_REFRESH_TTL_MS,
  });

  return res.json({
    accessToken,
    refreshToken,
    expiresIn: config.ADMIN_JWT_ACCESS_TTL_MS,
    tokenType: "Bearer",
  });
});

// ── POST /api/auth/refresh ───────────────────────────────────────────────

router.post("/refresh", (req: Request, res: Response) => {
  const config = getConfig();

  const { refreshToken } = req.body as { refreshToken?: unknown };

  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    return res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "Refresh token is required",
        details: [],
      },
    });
  }

  let payload: RefreshTokenPayload;
  try {
    payload = verifyToken<RefreshTokenPayload>(refreshToken, config.ADMIN_JWT_SECRET);
  } catch {
    return res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "Invalid or expired refresh token",
        details: [],
      },
    });
  }

  if (payload.type !== "refresh") {
    return res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "Token is not a refresh token",
        details: [],
      },
    });
  }

  const entry = refreshStore.get(refreshToken);
  if (!entry || entry.stellarAddress !== payload.stellarAddress) {
    return res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "Refresh token not found or revoked",
        details: [],
      },
    });
  }

  const now = Date.now();
  if (now > entry.expiresAt) {
    refreshStore.delete(refreshToken);
    return res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "Refresh token expired",
        details: [],
      },
    });
  }

  // ── Rotate: retire the old refresh token and issue a fresh pair ────────
  refreshStore.delete(refreshToken);

  const address = payload.stellarAddress;
  const newAccessToken = signToken(
    { stellarAddress: address, type: "access" },
    config.ADMIN_JWT_SECRET,
    config.ADMIN_JWT_ACCESS_TTL_MS
  );
  const newRefreshToken = signToken(
    { stellarAddress: address, type: "refresh" },
    config.ADMIN_JWT_SECRET,
    config.ADMIN_JWT_REFRESH_TTL_MS
  );

  refreshStore.set(newRefreshToken, {
    stellarAddress: address,
    issuedAt: now,
    expiresAt: now + config.ADMIN_JWT_REFRESH_TTL_MS,
  });

  return res.json({
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: config.ADMIN_JWT_ACCESS_TTL_MS,
    tokenType: "Bearer",
  });
});

export default router;
