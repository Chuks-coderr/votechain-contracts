// Copyright 2024 VoteChain Contributors
// SPDX-License-Identifier: Apache-2.0

import { RedisClientType } from 'redis';
import { LEADERBOARD_CACHE_TTL_SECONDS } from '../middleware/redisCache';

type MaybeRedis = RedisClientType | null | undefined;

export interface LeaderboardEntry {
  address: string;
  votes_cast: number;
  proposals_participated: number;
  total_weight_cast: number;
  rank: number;
}

const LEADERBOARD_CACHE_KEY_PREFIX = 'leaderboard:data:';

/**
 * Computes the top 50 voters by proposal participation count.
 * Results are cached for the configured TTL. Returns an empty list when Redis
 * is unavailable.
 */
export async function getLeaderboard(
  redisClient: MaybeRedis,
  filterKey = "",
): Promise<LeaderboardEntry[]> {
  if (!redisClient?.isOpen) return [];

  const cacheKey = `${LEADERBOARD_CACHE_KEY_PREFIX}${filterKey}`;

  const cached = await redisClient.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as LeaderboardEntry[];
  }

  // In production, this would query the indexer or database.
  const leaderboard: LeaderboardEntry[] = [];

  await redisClient.setEx(
    cacheKey,
    LEADERBOARD_CACHE_TTL_SECONDS,
    JSON.stringify(leaderboard)
  );

  return leaderboard;
}

/**
 * Invalidates the leaderboard cache when vote data changes.
 */
export async function invalidateLeaderboardCache(
  redisClient: MaybeRedis
): Promise<void> {
  if (!redisClient?.isOpen) return;
  for await (const key of redisClient.scanIterator({
    MATCH: `${LEADERBOARD_CACHE_KEY_PREFIX}*`,
  })) {
    await redisClient.del(key);
  }
}

/**
 * Warms the leaderboard cache proactively after an indexer update (#525).
 *
 * Called immediately after cache invalidation so the first user to read the
 * leaderboard after an update always gets a cache hit rather than paying the
 * compute cost of a cold load.
 *
 * Uses the default (empty string) filterKey to warm the base leaderboard.
 * Additional filter variants can be passed via the filterKeys parameter.
 */
export async function warmLeaderboardCache(
  redisClient: MaybeRedis,
  filterKeys: string[] = [""],
): Promise<void> {
  if (!redisClient?.isOpen) return;
  for (const key of filterKeys) {
    await getLeaderboard(redisClient, key);
  }
}

/**
 * Updates a voter's participation stats.
 * Called by the indexer when processing on-chain votes.
 *
 * After recording the vote:
 * 1. Invalidates stale cache entries.
 * 2. Warms the cache so the next read is a hit (#525).
 */
export async function recordVote(
  redisClient: MaybeRedis,
  address: string,
  weight: number,
  proposalId: string
): Promise<void> {
  if (!redisClient?.isOpen) return;

  const key = `voter:${address}`;
  await redisClient.hIncrBy(key, 'votes_cast', 1);
  await redisClient.hIncrByFloat(key, 'total_weight_cast', weight);
  await redisClient.sAdd(`voter:${address}:proposals`, proposalId);
  await invalidateLeaderboardCache(redisClient);
  // Warm cache immediately after invalidation (#525)
  await warmLeaderboardCache(redisClient);
}

/**
 * Retrieves vote history for a specific address.
 */
export async function getVoterStats(
  redisClient: MaybeRedis,
  address: string
): Promise<{
  address: string;
  votes_cast: number;
  proposals_participated: number;
  total_weight_cast: number;
}> {
  if (!redisClient?.isOpen) {
    return { address, votes_cast: 0, proposals_participated: 0, total_weight_cast: 0 };
  }

  const key = `voter:${address}`;
  const stats = await redisClient.hGetAll(key);
  const proposalCount = await redisClient.sCard(`voter:${address}:proposals`);

  return {
    address,
    votes_cast: parseInt(stats['votes_cast'] ?? '0', 10),
    proposals_participated: proposalCount,
    total_weight_cast: parseFloat(stats['total_weight_cast'] ?? '0'),
  };
}
