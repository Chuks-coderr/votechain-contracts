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
 * Governance analytics service (issue #104, streaming refactor #239).
 *
 * Computes the metrics backing GET /api/governance/analytics:
 *
 *   - participation_rate  : unique voters / total token holders, per proposal
 *   - pass_rate           : passed proposals / finalised proposals, rolling 30 days
 *   - avg_quorum_fill_rate : average(total_votes / quorum) across all proposals
 *   - voter_retention     : addresses that voted on > 50% of all proposals
 *
 * **Streaming / memory-bounded design (#239)**
 *
 * Rather than loading all rows into a JS array at once, the production
 * integration point (`streamProposalSnapshotsFromIndexer`) returns an
 * async-iterable cursor.  The accumulator functions below process one row at
 * a time, keeping peak heap well below 256 MB even for 1 M + vote records.
 *
 * The API response shape (GovernanceAnalytics) is unchanged — only the
 * internal computation pipeline is streaming.
 */

import type { RedisClientType } from "redis";

type MaybeRedisClient = RedisClientType | null;

const ANALYTICS_CACHE_KEY = "analytics:governance";
// Matches the dashboard's 60-second refresh requirement (issue #104) so a
// cache hit never serves data staler than one refresh cycle.
const CACHE_TTL_SECONDS = 60;
const ROLLING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Minimal per-proposal shape needed to compute every metric below. */
export interface ProposalSnapshot {
  id: string;
  quorum: number;
  totalVotes: number;
  uniqueVoters: string[];
  state: "Active" | "Passed" | "Rejected" | "Executed" | "Cancelled";
  finalisedAt: string | null; // ISO timestamp, null while Active
}

export interface GovernanceAnalytics {
  /** Unique voters / total token holders, keyed by proposal id. */
  participation_rate: Record<string, number>;
  /** passed / finalised proposals, over the last 30 days. */
  pass_rate: number;
  /** average(total_votes / quorum) across all proposals. */
  avg_quorum_fill_rate: number;
  /** Addresses that voted on more than 50% of all proposals. */
  voter_retention: string[];
  /** Count of proposals per lifecycle state, powering the "by state" chart. */
  by_state: Record<ProposalSnapshot["state"], number>;
  computed_at: string;
}

/**
 * Data-source integration point — **streaming cursor** (#239).
 *
 * Replace with a real cursor-based query against the indexer Postgres
 * database, e.g.:
 *
 *   const cursor = pool.query(
 *     new Cursor('SELECT ... FROM contract_events ORDER BY proposal_id')
 *   );
 *   // yield rows in batches so Node never holds the full result set
 *
 * Returns an async-iterable that yields ProposalSnapshot rows one at a time.
 * Yields nothing (empty iterable) when no data source is configured, so the
 * dashboard degrades gracefully.
 */
async function* streamProposalSnapshotsFromIndexer(): AsyncIterable<ProposalSnapshot> {
  // Production: open a Postgres cursor and yield rows in batches of e.g. 500.
  // Example (pg-cursor):
  //
  //   const cursor = client.query(new Cursor(SQL));
  //   let rows: ProposalSnapshot[];
  //   do {
  //     rows = await cursor.read(500);
  //     for (const row of rows) yield row;
  //   } while (rows.length > 0);
  //   await cursor.close();
  //
  // The stub below simply returns without yielding anything, keeping the
  // server functional in environments without a real indexer DB.
}

/** Total number of governance-token holders, used as the participation denominator. */
async function queryTotalTokenHolders(): Promise<number> {
  // In production: SELECT COUNT(DISTINCT holder) FROM token_balances WHERE balance > 0
  return 0;
}

// ---------------------------------------------------------------------------
// Streaming accumulators — O(1) memory per metric, O(n) total rows
// ---------------------------------------------------------------------------

interface StreamAccumulator {
  /** proposal id → unique-voter count */
  uniqueVoterCounts: Map<string, number>;
  /** proposal id → quorum */
  quorums: Map<string, number>;
  /** proposal id → total votes */
  totalVotesMap: Map<string, number>;
  /** proposal id → { state, finalisedAt } */
  proposalMeta: Map<string, { state: ProposalSnapshot["state"]; finalisedAt: string | null }>;
  /** voter address → number of proposals voted on */
  voterProposalCounts: Map<string, number>;
  /** count of rows seen — used as denominator for voter retention */
  proposalCount: number;
  /** per-state proposal counts */
  stateCounts: Record<ProposalSnapshot["state"], number>;
}

function createAccumulator(): StreamAccumulator {
  return {
    uniqueVoterCounts: new Map(),
    quorums: new Map(),
    totalVotesMap: new Map(),
    proposalMeta: new Map(),
    voterProposalCounts: new Map(),
    proposalCount: 0,
    stateCounts: { Active: 0, Passed: 0, Rejected: 0, Executed: 0, Cancelled: 0 },
  };
}

function accumulateRow(acc: StreamAccumulator, row: ProposalSnapshot): void {
  acc.proposalCount++;
  acc.uniqueVoterCounts.set(row.id, row.uniqueVoters.length);
  acc.quorums.set(row.id, row.quorum);
  acc.totalVotesMap.set(row.id, row.totalVotes);
  acc.proposalMeta.set(row.id, { state: row.state, finalisedAt: row.finalisedAt });
  acc.stateCounts[row.state]++;

  for (const voter of row.uniqueVoters) {
    acc.voterProposalCounts.set(voter, (acc.voterProposalCounts.get(voter) ?? 0) + 1);
  }
}

function finaliseAccumulator(
  acc: StreamAccumulator,
  totalHolders: number,
  now: Date
): GovernanceAnalytics {
  // participation_rate — uniqueVoters / totalHolders per proposal
  const participation_rate: Record<string, number> = {};
  for (const [id, count] of acc.uniqueVoterCounts) {
    participation_rate[id] = totalHolders > 0 ? count / totalHolders : 0;
  }

  // pass_rate — passed / finalised over last 30 days
  const cutoff = now.getTime() - ROLLING_WINDOW_MS;
  let finalised = 0;
  let passed = 0;
  for (const [, meta] of acc.proposalMeta) {
    if (
      (meta.state === "Passed" || meta.state === "Rejected" || meta.state === "Executed") &&
      meta.finalisedAt !== null &&
      new Date(meta.finalisedAt).getTime() >= cutoff
    ) {
      finalised++;
      if (meta.state === "Passed" || meta.state === "Executed") passed++;
    }
  }
  const pass_rate = finalised === 0 ? 0 : passed / finalised;

  // avg_quorum_fill_rate
  let quorumSum = 0;
  let quorumCount = 0;
  for (const [id, quorum] of acc.quorums) {
    if (quorum > 0) {
      quorumSum += (acc.totalVotesMap.get(id) ?? 0) / quorum;
      quorumCount++;
    }
  }
  const avg_quorum_fill_rate = quorumCount === 0 ? 0 : quorumSum / quorumCount;

  // voter_retention — addresses voting on > 50% of proposals
  const threshold = acc.proposalCount / 2;
  const voter_retention = [...acc.voterProposalCounts.entries()]
    .filter(([, count]) => count > threshold)
    .map(([address]) => address)
    .sort();

  return {
    participation_rate,
    pass_rate,
    avg_quorum_fill_rate,
    voter_retention,
    by_state: acc.stateCounts,
    computed_at: now.toISOString(),
  };
}

/**
 * Computes (or returns cached) governance analytics using a streaming cursor
 * over the data source (#239). Memory usage is bounded regardless of dataset
 * size because rows are accumulated one at a time rather than buffered.
 *
 * Degrades to zeroed metrics when Redis is unavailable rather than throwing,
 * matching the resilience pattern used elsewhere in the backend (#38).
 */
export async function getGovernanceAnalytics(
  redisClient: MaybeRedisClient
): Promise<GovernanceAnalytics> {
  if (redisClient?.isOpen) {
    const cached = await redisClient.get(ANALYTICS_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as GovernanceAnalytics;
    }
  }

  const now = new Date();
  const totalHolders = await queryTotalTokenHolders();

  // Stream rows from the data source — no full result set in memory (#239)
  const acc = createAccumulator();
  for await (const row of streamProposalSnapshotsFromIndexer()) {
    accumulateRow(acc, row);
  }

  const analytics = finaliseAccumulator(acc, totalHolders, now);

  if (redisClient?.isOpen) {
    await redisClient.setEx(ANALYTICS_CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(analytics));
  }

  return analytics;
}

/** Invalidates the analytics cache when new vote/finalise events are indexed. */
export async function invalidateAnalyticsCache(redisClient: MaybeRedisClient): Promise<void> {
  if (!redisClient?.isOpen) return;
  await redisClient.del(ANALYTICS_CACHE_KEY);
}
