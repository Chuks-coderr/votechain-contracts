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
 * Unit tests for apiKeyService and apiKeyAuth middleware.
 *
 * Redis is mocked with a simple in-memory store so tests run without a
 * real Redis instance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// In-memory Redis mock
// ---------------------------------------------------------------------------

// We define the mock BEFORE importing any module that uses redisCache,
// so that the vi.mock() hoisting replaces the module at import time.

const store = new Map<string, string | Map<string, string>>();

// Utilities to inspect / mutate the mock store from tests
function mockGet(key: string): string | null {
  const v = store.get(key);
  return typeof v === "string" ? v : null;
}
function mockHGetAll(key: string): Record<string, string> {
  const v = store.get(key);
  if (v instanceof Map) return Object.fromEntries(v);
  return {};
}

const mockRedis = {
  isOpen: true,
  get: vi.fn(async (key: string) => mockGet(key)),
  set: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
    return "OK";
  }),
  del: vi.fn(async (...args: unknown[]) => {
    // supports del(key) and del([key1, key2])
    const keys = Array.isArray(args[0]) ? (args[0] as string[]) : (args as string[]);
    for (const k of keys) store.delete(k);
    return keys.length;
  }),
  hSet: vi.fn(async (key: string, fields: Record<string, string>) => {
    let m = store.get(key);
    if (!(m instanceof Map)) m = new Map();
    for (const [f, v] of Object.entries(fields)) m.set(f, v);
    store.set(key, m);
    return Object.keys(fields).length;
  }),
  hGetAll: vi.fn(async (key: string) => mockHGetAll(key)),
  hDel: vi.fn(async (key: string, field: string) => {
    const m = store.get(key);
    if (m instanceof Map) m.delete(field);
    return 1;
  }),
  expire: vi.fn(async () => 1),
  incr: vi.fn(async (key: string) => {
    const current = Number(mockGet(key) ?? "0");
    const next = current + 1;
    store.set(key, String(next));
    return next;
  }),
  multi: vi.fn(() => mockPipeline()),
};

function mockPipeline() {
  const ops: Array<() => Promise<unknown>> = [];
  const pipeline = {
    hSet: (key: string, fields: Record<string, string>) => {
      ops.push(() => mockRedis.hSet(key, fields));
      return pipeline;
    },
    hDel: (key: string, field: string) => {
      ops.push(() => mockRedis.hDel(key, field));
      return pipeline;
    },
    set: (key: string, value: string) => {
      ops.push(() => mockRedis.set(key, value));
      return pipeline;
    },
    del: (...args: unknown[]) => {
      ops.push(() => (mockRedis.del as (...a: unknown[]) => Promise<number>)(...args));
      return pipeline;
    },
    exec: async () => {
      const results = [];
      for (const op of ops) results.push(await op());
      return results;
    },
  };
  return pipeline;
}

vi.mock("../src/middleware/redisCache", () => ({
  getRedis: () => mockRedis,
  isRedisReady: () => true,
  log: () => {},
}));

vi.mock("../src/middleware/requestTracing", () => ({
  log: () => {},
}));

// ---------------------------------------------------------------------------
// Import modules AFTER mocks are established
// ---------------------------------------------------------------------------

import {
  createApiKey,
  getApiKeyMeta,
  resolveApiKey,
  rotateApiKey,
  revokeApiKey,
  suspendApiKey,
  reinstateApiKey,
} from "../src/services/apiKeyService";

// ---------------------------------------------------------------------------
// Helper to build a mock Express request/response/next for middleware tests
// ---------------------------------------------------------------------------

function mockRequest(overrides: Record<string, unknown> = {}): {
  headers: Record<string, string>;
  ip: string;
  apiKeyTier: string;
  apiKeyMeta: unknown;
} & Record<string, unknown> {
  return {
    headers: {},
    ip: "127.0.0.1",
    apiKeyTier: "anon",
    apiKeyMeta: undefined,
    ...overrides,
  };
}

function mockResponse() {
  const res: Record<string, unknown> = {};
  const calls: Array<{ status?: number; body?: unknown }> = [];
  res.status = vi.fn((s: number) => {
    calls.push({ status: s });
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    if (calls.length > 0) calls[calls.length - 1]!.body = body;
    else calls.push({ body });
    return res;
  });
  res._calls = calls;
  return res;
}

// ---------------------------------------------------------------------------
// apiKeyService tests
// ---------------------------------------------------------------------------

describe("apiKeyService", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    store.clear();
  });

  it("creates a key and returns a raw key with vc_ prefix", async () => {
    const { rawKey, meta } = await createApiKey("GABC123", "My DAO");

    expect(rawKey).toMatch(/^vc_[0-9a-f]{64}$/);
    expect(meta.owner).toBe("GABC123");
    expect(meta.label).toBe("My DAO");
    expect(meta.status).toBe("active");
    expect(meta.keyPrefix).toBe(rawKey.slice(0, 8));
  });

  it("stores key hash and reverse lookup, NOT the raw key", async () => {
    const { rawKey, meta } = await createApiKey("GABC123", "Secure DAO");

    const hashStored = mockGet(`apikey:hash:${meta.id}`);
    expect(hashStored).not.toBe(rawKey);
    expect(hashStored).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex

    const idFromLookup = mockGet(`apikey:lookup:${hashStored}`);
    expect(idFromLookup).toBe(meta.id);
  });

  it("resolves a valid raw key to its metadata", async () => {
    const { rawKey, meta } = await createApiKey("GXYZ789", "Resolver Test");

    const resolved = await resolveApiKey(rawKey);

    expect(resolved).not.toBeNull();
    expect(resolved?.id).toBe(meta.id);
    expect(resolved?.owner).toBe("GXYZ789");
  });

  it("returns null when resolving an unknown key", async () => {
    const resolved = await resolveApiKey("vc_nonexistentkey");
    expect(resolved).toBeNull();
  });

  it("retrieves metadata by ID", async () => {
    const { meta } = await createApiKey("GOWNER", "Get Test");

    const fetched = await getApiKeyMeta(meta.id);
    expect(fetched?.id).toBe(meta.id);
    expect(fetched?.status).toBe("active");
  });

  it("returns null for an unknown ID", async () => {
    const fetched = await getApiKeyMeta("nonexistent-id");
    expect(fetched).toBeNull();
  });

  it("rotates a key: old key no longer resolves, new key does", async () => {
    const { rawKey: oldKey, meta } = await createApiKey("GROTATE", "Rotate Test");

    const { rawKey: newKey } = await rotateApiKey(meta.id);

    expect(newKey).not.toBe(oldKey);
    expect(await resolveApiKey(oldKey)).toBeNull();
    const newResolved = await resolveApiKey(newKey);
    expect(newResolved?.id).toBe(meta.id);
    expect(newResolved?.status).toBe("active");
  });

  it("rotation resets suspended status to active", async () => {
    const { meta } = await createApiKey("GSUSPEND", "Suspend Test");
    await suspendApiKey(meta.id);

    const suspended = await getApiKeyMeta(meta.id);
    expect(suspended?.status).toBe("suspended");

    await rotateApiKey(meta.id);
    const afterRotate = await getApiKeyMeta(meta.id);
    expect(afterRotate?.status).toBe("active");
    expect(afterRotate?.suspendedAt).toBeUndefined();
  });

  it("throws when rotating a revoked key", async () => {
    const { meta } = await createApiKey("GREVOKED", "Revoke Test");
    await revokeApiKey(meta.id);

    await expect(rotateApiKey(meta.id)).rejects.toThrow("Cannot rotate a revoked key");
  });

  it("revokes a key: status becomes revoked and key no longer resolves", async () => {
    const { rawKey, meta } = await createApiKey("GREVOKE", "Revoke Me");
    await revokeApiKey(meta.id);

    expect(await resolveApiKey(rawKey)).toBeNull();
    const revoked = await getApiKeyMeta(meta.id);
    expect(revoked?.status).toBe("revoked");
  });

  it("suspends a key: status becomes suspended", async () => {
    const { meta } = await createApiKey("GSUSPENDME", "Abuse Test");
    await suspendApiKey(meta.id);

    const s = await getApiKeyMeta(meta.id);
    expect(s?.status).toBe("suspended");
    expect(s?.suspendedAt).toBeDefined();
  });

  it("reinstates a suspended key", async () => {
    const { meta } = await createApiKey("GREINSTATE", "Reinstate Test");
    await suspendApiKey(meta.id);
    await reinstateApiKey(meta.id);

    const reinstated = await getApiKeyMeta(meta.id);
    expect(reinstated?.status).toBe("active");
    expect(reinstated?.suspendedAt).toBeUndefined();
  });

  it("throws when reinstating a non-suspended key", async () => {
    const { meta } = await createApiKey("GACTIVE", "Active Key");
    await expect(reinstateApiKey(meta.id)).rejects.toThrow("Key is not suspended");
  });
});

// ---------------------------------------------------------------------------
// apiKeyAuth middleware tests
// ---------------------------------------------------------------------------

describe("apiKeyAuth middleware", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    store.clear();
  });

  async function runMiddleware(
    req: ReturnType<typeof mockRequest>,
    res: ReturnType<typeof mockResponse>
  ) {
    // Import middleware inside the test so mocks are already set up
    const { apiKeyAuth } = await import("../src/middleware/apiKeyAuth");
    const next = vi.fn();
    await apiKeyAuth(req as never, res as never, next);
    return { next };
  }

  it("sets anon tier when no Authorization header present", async () => {
    const req = mockRequest();
    const res = mockResponse();
    const { next } = await runMiddleware(req, res);

    expect(req.apiKeyTier).toBe("anon");
    expect(next).toHaveBeenCalled();
  });

  it("sets anon tier for non-Bearer Authorization", async () => {
    const req = mockRequest({ headers: { authorization: "Basic abc123" } });
    const res = mockResponse();
    const { next } = await runMiddleware(req, res);

    expect(req.apiKeyTier).toBe("anon");
    expect(next).toHaveBeenCalled();
  });

  it("passes through non-vc_ Bearer tokens (admin JWT path)", async () => {
    const req = mockRequest({
      headers: { authorization: "Bearer eyJhbGc.eyJzdWIiOi.SflKxw" },
    });
    const res = mockResponse();
    const { next } = await runMiddleware(req, res);

    // Should not block — falls through to adminAuth
    expect(req.apiKeyTier).toBe("anon");
    expect(next).toHaveBeenCalled();
  });

  it("sets api_key tier for a valid active key", async () => {
    const { rawKey, meta } = await createApiKey("GAUTH", "Auth Test");

    const req = mockRequest({
      headers: { authorization: `Bearer ${rawKey}` },
    });
    const res = mockResponse();
    const { next } = await runMiddleware(req, res);

    expect(req.apiKeyTier).toBe("api_key");
    expect((req as never as { apiKeyMeta: { id: string } }).apiKeyMeta?.id).toBe(meta.id);
    expect(next).toHaveBeenCalled();
  });

  it("returns 401 for an unknown vc_ token", async () => {
    const req = mockRequest({
      headers: { authorization: "Bearer vc_unknown_key_that_does_not_exist" },
    });
    const res = mockResponse();
    const { next } = await runMiddleware(req, res);

    expect(next).not.toHaveBeenCalled();
    const call = (res._calls as Array<{ status?: number; body?: { error: { code: string } } }>)[0];
    expect(call?.status).toBe(401);
    expect(call?.body?.error?.code).toBe("INVALID_API_KEY");
  });

  it("returns 401 for a revoked key (seen as unknown because lookup is deleted)", async () => {
    // When a key is revoked, revokeApiKey() deletes the reverse-lookup entry
    // (apikey:lookup:<sha256>) so the raw key can no longer be resolved to an
    // ID.  From the middleware's perspective the key is simply unknown →
    // INVALID_API_KEY.  This is intentional: we don't want to leak whether a
    // key was revoked vs. never existed.
    const { rawKey, meta } = await createApiKey("GREVAUTH", "Revoked Auth");
    await revokeApiKey(meta.id);

    const req = mockRequest({
      headers: { authorization: `Bearer ${rawKey}` },
    });
    const res = mockResponse();
    const { next } = await runMiddleware(req, res);

    expect(next).not.toHaveBeenCalled();
    const call = (res._calls as Array<{ status?: number; body?: { error: { code: string } } }>)[0];
    expect(call?.status).toBe(401);
    // After revocation the lookup is gone — indistinguishable from an unknown key
    expect(call?.body?.error?.code).toBe("INVALID_API_KEY");
  });

  it("returns 401 REVOKED_KEY when lookup intact but status is revoked (partial-failure edge case)", async () => {
    // Simulate a scenario where the lookup entry was not cleaned up but the
    // metadata records status = "revoked" (e.g. a pipeline failure mid-way).
    // resolveApiKey returns the meta record; apiKeyAuth should surface REVOKED_KEY.
    const { rawKey } = await createApiKey("GREVMETA", "Partial Revoke");
    // Mark the key as revoked in the metadata WITHOUT deleting the lookup
    const resolvedViaRaw = await resolveApiKey(rawKey);
    if (resolvedViaRaw) {
      // Directly mutate the mock store to set status=revoked without removing lookup
      const m = store.get(`apikey:meta:${resolvedViaRaw.id}`);
      if (m instanceof Map) m.set("status", "revoked");
    }

    const req = mockRequest({
      headers: { authorization: `Bearer ${rawKey}` },
    });
    const res = mockResponse();
    const { next } = await runMiddleware(req, res);

    expect(next).not.toHaveBeenCalled();
    const call = (res._calls as Array<{ status?: number; body?: { error: { code: string } } }>)[0];
    expect(call?.status).toBe(401);
    expect(call?.body?.error?.code).toBe("REVOKED_KEY");
  });

  it("returns 403 for a suspended key", async () => {
    const { rawKey, meta } = await createApiKey("GSUSPAUTH", "Suspended Auth");
    await suspendApiKey(meta.id);

    const req = mockRequest({
      headers: { authorization: `Bearer ${rawKey}` },
    });
    const res = mockResponse();
    const { next } = await runMiddleware(req, res);

    expect(next).not.toHaveBeenCalled();
    const call = (res._calls as Array<{ status?: number; body?: { error: { code: string } } }>)[0];
    expect(call?.status).toBe(403);
    expect(call?.body?.error?.code).toBe("SUSPENDED_KEY");
  });
});
