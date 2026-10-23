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
 * API key management routes.
 *
 * All endpoints are admin-only (protected by the adminAuth middleware).
 *
 * POST   /api/keys                      Create a new API key
 * GET    /api/keys/:id                  Get key metadata (no raw key)
 * POST   /api/keys/:id/rotate           Rotate (reissue) a key
 * POST   /api/keys/:id/reinstate        Reinstate a suspended key
 * DELETE /api/keys/:id                  Revoke (permanently delete) a key
 *
 * Request / Response bodies are documented inline below.
 */

import { Router, Request, Response } from "express";
import { adminAuth } from "../middleware/adminAuth";
import {
  createApiKey,
  getApiKeyMeta,
  reinstateApiKey,
  revokeApiKey,
  rotateApiKey,
} from "../services/apiKeyService";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Send a consistent 404 when a key ID is not found. */
function notFound(res: Response): void {
  res.status(404).json({
    error: {
      code: "KEY_NOT_FOUND",
      message: "API key not found",
      details: [],
    },
  });
}

/** Send a consistent 400 for validation errors. */
function badRequest(res: Response, message: string): void {
  res.status(400).json({
    error: {
      code: "INVALID_REQUEST",
      message,
      details: [],
    },
  });
}

// ── POST /api/keys  ─────────────────────────────────────────────────────────
/**
 * Create a new API key.
 *
 * Request body:
 *   { "owner": "<Stellar address>", "label": "<human-readable label>" }
 *
 * Response 201:
 *   { "key": "<raw key — shown once>", "meta": { id, owner, label, ... } }
 *
 * The raw key is ONLY returned in this response.  It cannot be recovered.
 */
router.post("/keys", adminAuth, async (req: Request, res: Response) => {
  const { owner, label } = req.body as { owner?: string; label?: string };

  if (typeof owner !== "string" || owner.trim() === "") {
    return badRequest(res, "'owner' (Stellar address) is required");
  }
  if (typeof label !== "string" || label.trim() === "") {
    return badRequest(res, "'label' is required");
  }
  if (label.trim().length > 128) {
    return badRequest(res, "'label' must be 128 characters or fewer");
  }

  try {
    const { rawKey, meta } = await createApiKey(owner.trim(), label.trim());
    return res.status(201).json({ key: rawKey, meta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(503).json({
      error: { code: "SERVICE_UNAVAILABLE", message, details: [] },
    });
  }
});

// ── GET /api/keys/:id  ───────────────────────────────────────────────────────
/**
 * Retrieve key metadata (no raw key).
 *
 * Response 200:
 *   { "meta": { id, owner, label, createdAt, status, keyPrefix, suspendedAt? } }
 */
router.get("/keys/:id", adminAuth, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const meta = await getApiKeyMeta(id);
    if (!meta) return notFound(res);
    return res.json({ meta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return res.status(503).json({
      error: { code: "SERVICE_UNAVAILABLE", message, details: [] },
    });
  }
});

// ── POST /api/keys/:id/rotate  ───────────────────────────────────────────────
/**
 * Rotate (reissue) a key.  The old key is immediately invalidated.
 *
 * Response 200:
 *   { "key": "<new raw key — shown once>", "meta": { ... } }
 */
router.post(
  "/keys/:id/rotate",
  adminAuth,
  async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      const { rawKey, meta } = await rotateApiKey(id);
      return res.json({ key: rawKey, meta });
    } catch (err) {
      if (err instanceof Error && err.message === "Key not found") {
        return notFound(res);
      }
      if (err instanceof Error && err.message === "Cannot rotate a revoked key") {
        return res.status(409).json({
          error: {
            code: "KEY_REVOKED",
            message: "Cannot rotate a revoked key. Create a new key instead.",
            details: [],
          },
        });
      }
      const message = err instanceof Error ? err.message : "Internal error";
      return res.status(503).json({
        error: { code: "SERVICE_UNAVAILABLE", message, details: [] },
      });
    }
  }
);

// ── POST /api/keys/:id/reinstate  ─────────────────────────────────────────────
/**
 * Reinstate a suspended key.
 *
 * Response 200:
 *   { "ok": true, "meta": { ... } }
 */
router.post(
  "/keys/:id/reinstate",
  adminAuth,
  async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      await reinstateApiKey(id);
      const meta = await getApiKeyMeta(id);
      return res.json({ ok: true, meta });
    } catch (err) {
      if (err instanceof Error && err.message === "Key not found") {
        return notFound(res);
      }
      if (err instanceof Error && err.message === "Key is not suspended") {
        return res.status(409).json({
          error: {
            code: "KEY_NOT_SUSPENDED",
            message: "Key is not in a suspended state",
            details: [],
          },
        });
      }
      const message = err instanceof Error ? err.message : "Internal error";
      return res.status(503).json({
        error: { code: "SERVICE_UNAVAILABLE", message, details: [] },
      });
    }
  }
);

// ── DELETE /api/keys/:id  ────────────────────────────────────────────────────
/**
 * Revoke (permanently delete) a key.  This cannot be undone.
 *
 * Response 200:
 *   { "ok": true }
 */
router.delete(
  "/keys/:id",
  adminAuth,
  async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      const meta = await getApiKeyMeta(id);
      if (!meta) return notFound(res);

      await revokeApiKey(id);
      return res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      return res.status(503).json({
        error: { code: "SERVICE_UNAVAILABLE", message, details: [] },
      });
    }
  }
);

export default router;
