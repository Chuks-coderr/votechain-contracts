import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for leaderboard cache warming on indexer updates (#525).
 *
 * Verifies that after recordVote is called:
 *   1. The stale cache is invalidated.
 *   2. The cache is immediately warmed so the first read is a HIT.
 */

const redisState = vi.hoisted(() => {
  const store = new Map<string, string>();
  const scanKeys: string[] = [];

  return {
    store,
    scanKeys,
    client: {
      isOpen: true,
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      setEx: vi.fn(async (key: string, _ttl: number, value: string) => {
        store.set(key, value);
        return "OK";
      }),
      del: vi.fn(async (key: string) => {
        store.delete(key);
        scanKeys.splice(scanKeys.indexOf(key), 1);
        return 1;
      }),
      hIncrBy: vi.fn().mockResolvedValue(1),
      hIncrByFloat: vi.fn().mockResolvedValue(1.0),
      sAdd: vi.fn().mockResolvedValue(1),
      scanIterator: vi.fn(function* () {
        for (const k of [...scanKeys]) yield k;
      }),
    },
  };
});

vi.mock("../src/middleware/redisCache", () => ({
  LEADERBOARD_CACHE_TTL_SECONDS: 60,
}));

import {
  recordVote,
  warmLeaderboardCache,
  getLeaderboard,
  invalidateLeaderboardCache,
} from "../src/services/leaderboardService";

describe("leaderboard cache warming on indexer update (#525)", () => {
  beforeEach(() => {
    redisState.store.clear();
    redisState.scanKeys.length = 0;
    vi.clearAllMocks();
    // Reset mock implementations after clearAllMocks
    redisState.client.get.mockImplementation(
      async (key: string) => redisState.store.get(key) ?? null,
    );
    redisState.client.setEx.mockImplementation(
      async (key: string, _ttl: number, value: string) => {
        redisState.store.set(key, value);
        return "OK";
      },
    );
    redisState.client.del.mockImplementation(async (key: string) => {
      redisState.store.delete(key);
      return 1;
    });
    redisState.client.scanIterator.mockImplementation(function* () {
      for (const k of [...redisState.scanKeys]) yield k;
    });
  });

  it("warms the cache after recordVote so the first read is a cache hit", async () => {
    const redis = redisState.client as unknown as Parameters<typeof recordVote>[0];

    await recordVote(redis, "GADDR1", 100, "proposal-1");

    // After recordVote, getLeaderboard should find a cache entry (HIT path)
    const cacheKey = "leaderboard:data:";
    expect(redisState.store.has(cacheKey)).toBe(true);
  });

  it("warmLeaderboardCache populates cache for each filterKey", async () => {
    const redis = redisState.client as unknown as Parameters<typeof warmLeaderboardCache>[0];

    await warmLeaderboardCache(redis, ["", "active", "closed"]);

    expect(redisState.store.has("leaderboard:data:")).toBe(true);
    expect(redisState.store.has("leaderboard:data:active")).toBe(true);
    expect(redisState.store.has("leaderboard:data:closed")).toBe(true);
  });

  it("first read after recordVote is a cache hit (setEx called during warming)", async () => {
    const redis = redisState.client as unknown as Parameters<typeof recordVote>[0];

    await recordVote(redis, "GADDR2", 50, "proposal-2");

    // setEx should have been called by warmLeaderboardCache → getLeaderboard
    const setExCalls = redisState.client.setEx.mock.calls.map(
      (c: unknown[]) => c[0],
    );
    expect(setExCalls.some((k: unknown) => String(k).startsWith("leaderboard:data:"))).toBe(true);
  });

  it("cache warming is a no-op when Redis is unavailable", async () => {
    await warmLeaderboardCache(null);
    await warmLeaderboardCache(undefined);
    // No errors thrown — passes by reaching here
  });
});
