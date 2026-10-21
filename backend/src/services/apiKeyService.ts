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
 * API key service for VoteChain's verified-DAO tier.
 *
 * Storage layout (Redis):
 *   apikey:meta:<id>   HASH  { owner, label, createdAt, status, suspendedAt? }
 *   apikey:hash:<id>   STRING  SHA-256 hex of the raw key (we never store the raw key)
 *   apikey:lookup:<sha256>  STRING  <id>   (reverse-lookup index)
 *
 * The raw key is only returned once at create/rotate time; after that it
 * cannot be recovered (similar to GitHub personal access tokens).
 *
 * Abuse / suspension:
 *   When the rate-limiter detects anomalous traffic (configurable burst
 *   threshold), it calls suspendKey().  The key is marked "suspended" and
 *   subsequent requests using it are rejected with 403 SUSPENDED_KEY.
 *   Keys can be reinstated with reinstateKey() (admin-only endpoint).
 */

import crypto from "node:crypto";
import { getRedis } from "../middleware/redisCache";
import { log } from "../middleware/requestTracing";

// ── Constants ──────────────────────────────────────────────────────────────

/** Prefix length we show in list responses so users can identify their key. */
const KEY_PREFIX_LENGTH = 8;

/** Redis key TTL for metadata — 0 means no expiry (keys live forever until revoked). */
const META_TTL_SECONDS = 0;

// ── Types ──────────────────────────────────────────────────────────────────

export type ApiKeyStatus = "active" | "suspended" | "revoked";

export interface ApiKeyMeta {
  id: string;
  owner: string;   // Stellar address of the DAO that owns this key
  label: string;   // Human-readable label chosen at creation time
  createdAt: string;   // ISO-8601
  status: ApiKeyStatus;
  suspendedAt?: string; // ISO-8601, set when status becomes "suspended"
  keyPrefix: string;   // First 8 chars of the raw key (for identification)
}

export interface CreateKeyResult {
  meta: ApiKeyMeta;
  /** Raw key — shown ONCE, never stored. */
  rawKey: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function redisKeyMeta(id: string): string {
  return `apikey:meta:${id}`;
}
function redisKeyHash(id: string): string {
  return `apikey:hash:${id}`;
}
function redisKeyLookup(sha256: string): string {
  return `apikey:lookup:${sha256}`;
}

/** Generate a cryptographically random API key with a recognisable prefix. */
function generateRawKey(): string {
  const random = crypto.randomBytes(32).toString("hex"); // 64 hex chars
  return `vc_${random}`; // e.g. vc_4a3b2c1d...
}

/** SHA-256 hex digest of the raw key. */
function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/** Generate a short, unique ID for a key record. */
function generateId(): string {
  return crypto.randomBytes(12).toString("hex"); // 24 hex chars
}

// ── Service functions ──────────────────────────────────────────────────────

/**
 * Create a new API key for the given owner (Stellar address) and label.
 *
 * Returns the full metadata and the raw key (shown once).
 * Throws if Redis is unavailable.
 */
export async function createApiKey(owner: string, label: string): Promise<CreateKeyResult> {
  const redis = getRedis();
  if (!redis?.isOpen) throw new Error("Redis unavailable");

  const id = generateId();
  const rawKey = generateRawKey();
  const sha256 = hashKey(rawKey);
  const now = new Date().toISOString();

  const meta: ApiKeyMeta = {
    id,
    owner,
    label,
    createdAt: now,
    status: "active",
    keyPrefix: rawKey.slice(0, KEY_PREFIX_LENGTH),
  };

  // Store metadata hash, hashed key, and reverse lookup atomically.
  const pipeline = redis.multi();
  pipeline.hSet(redisKeyMeta(id), {
    id,
    owner,
    label,
    createdAt: now,
    status: "active",
    keyPrefix: rawKey.slice(0, KEY_PREFIX_LENGTH),
  });
  pipeline.set(redisKeyHash(id), sha256);
  pipeline.set(redisKeyLookup(sha256), id);
  await pipeline.exec();

  log("info", "api key created", { id, owner, label });
  return { meta, rawKey };
}

/**
 * Rotate an existing key: invalidates the old key and issues a new one.
 *
 * - Only keys with status "active" or "suspended" can be rotated.
 * - The old raw key is immediately invalid after rotation.
 *
 * Returns the new raw key (shown once).
 */
export async function rotateApiKey(id: string): Promise<CreateKeyResult> {
  const redis = getRedis();
  if (!redis?.isOpen) throw new Error("Redis unavailable");

  const meta = await getApiKeyMeta(id);
  if (!meta) throw new Error("Key not found");
  if (meta.status === "revoked") throw new Error("Cannot rotate a revoked key");

  // Remove the old lookup index so the old key no longer authenticates.
  const oldHash = await redis.get(redisKeyHash(id));
  if (oldHash) {
    await redis.del(redisKeyLookup(oldHash));
  }

  const rawKey = generateRawKey();
  const sha256 = hashKey(rawKey);
  const now = new Date().toISOString();

  const updatedMeta: ApiKeyMeta = {
    ...meta,
    status: "active",
    suspendedAt: undefined,
    createdAt: now, // reset createdAt to rotation time
    keyPrefix: rawKey.slice(0, KEY_PREFIX_LENGTH),
  };

  const pipeline = redis.multi();
  pipeline.hSet(redisKeyMeta(id), {
    status: "active",
    createdAt: now,
    keyPrefix: rawKey.slice(0, KEY_PREFIX_LENGTH),
  });
  // Clear suspendedAt if it existed
  pipeline.hDel(redisKeyMeta(id), "suspendedAt");
  pipeline.set(redisKeyHash(id), sha256);
  pipeline.set(redisKeyLookup(sha256), id);
  await pipeline.exec();

  log("info", "api key rotated", { id });
  return { meta: updatedMeta, rawKey };
}

/**
 * Revoke (permanently delete) an API key.
 *
 * Removes all Redis entries.  The key can no longer be used or rotated.
 */
export async function revokeApiKey(id: string): Promise<void> {
  const redis = getRedis();
  if (!redis?.isOpen) throw new Error("Redis unavailable");

  // Remove lookup index so the raw key no longer authenticates.
  const oldHash = await redis.get(redisKeyHash(id));

  const pipeline = redis.multi();
  pipeline.hSet(redisKeyMeta(id), { status: "revoked" });
  pipeline.del(redisKeyHash(id));
  if (oldHash) pipeline.del(redisKeyLookup(oldHash));
  await pipeline.exec();

  log("info", "api key revoked", { id });
}

/**
 * Suspend a key due to anomalous traffic.  Called by the abuse-detection
 * layer in the rate-limit middleware.
 *
 * Suspended keys are rejected with 403.  They can be reinstated by an admin.
 */
export async function suspendApiKey(id: string): Promise<void> {
  const redis = getRedis();
  if (!redis?.isOpen) return; // best-effort; don't crash on Redis loss

  const now = new Date().toISOString();
  await redis.hSet(redisKeyMeta(id), { status: "suspended", suspendedAt: now });

  log("warn", "api key suspended — anomalous traffic", { id, suspendedAt: now });
}

/**
 * Reinstate a suspended key.  Admin-only operation.
 */
export async function reinstateApiKey(id: string): Promise<void> {
  const redis = getRedis();
  if (!redis?.isOpen) throw new Error("Redis unavailable");

  const meta = await getApiKeyMeta(id);
  if (!meta) throw new Error("Key not found");
  if (meta.status !== "suspended") throw new Error("Key is not suspended");

  const pipeline = redis.multi();
  pipeline.hSet(redisKeyMeta(id), { status: "active" });
  pipeline.hDel(redisKeyMeta(id), "suspendedAt");
  await pipeline.exec();

  log("info", "api key reinstated", { id });
}

/**
 * Look up metadata by key ID.
 */
export async function getApiKeyMeta(id: string): Promise<ApiKeyMeta | null> {
  const redis = getRedis();
  if (!redis?.isOpen) return null;

  const raw = await redis.hGetAll(redisKeyMeta(id));
  if (!raw || !raw.id) return null;

  return {
    id: raw.id,
    owner: raw.owner ?? "",
    label: raw.label ?? "",
    createdAt: raw.createdAt ?? "",
    status: (raw.status as ApiKeyStatus) ?? "active",
    suspendedAt: raw.suspendedAt || undefined,
    keyPrefix: raw.keyPrefix ?? "",
  };
}

/**
 * Resolve a raw API key to its metadata.
 *
 * Returns null if the key is unknown or Redis is unavailable.
 * Used by the apiKeyAuth middleware on every authenticated request.
 */
export async function resolveApiKey(rawKey: string): Promise<ApiKeyMeta | null> {
  const redis = getRedis();
  if (!redis?.isOpen) return null;

  const sha256 = hashKey(rawKey);
  const id = await redis.get(redisKeyLookup(sha256));
  if (!id) return null;

  return getApiKeyMeta(id);
}
