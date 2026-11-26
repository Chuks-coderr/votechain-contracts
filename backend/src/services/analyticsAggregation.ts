// Copyright 2024 VoteChain Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Time-bucketed analytics aggregation (#524).
 *
 * Precomputes hourly and daily participation and proposal counts so the
 * /analytics endpoint returns pre-aggregated data rather than computing
 * on the fly.
 */

export type BucketGranularity = "hourly" | "daily";

export interface TimeBucket {
  bucket_start: string;   // ISO timestamp (truncated to hour or day)
  granularity: BucketGranularity;
  proposal_count: number;
  participation_count: number; // total unique voter appearances across proposals
}

/**
 * Truncates an ISO timestamp to the start of its hour or day (UTC).
 */
export function truncateToBucket(isoTimestamp: string, granularity: BucketGranularity): string {
  const d = new Date(isoTimestamp);
  if (granularity === "hourly") {
    d.setUTCMinutes(0, 0, 0);
  } else {
    d.setUTCHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

export interface ProposalBucketInput {
  finalisedAt: string | null;
  uniqueVoters: string[];
}

/**
 * Aggregates an array of proposal snapshots into time buckets.
 *
 * Only proposals with a non-null finalisedAt are bucketed (active proposals
 * have no finalisation timestamp to bucket on).
 *
 * Returns buckets sorted by bucket_start ascending.
 */
export function aggregateIntoBuckets(
  proposals: ProposalBucketInput[],
  granularity: BucketGranularity,
): TimeBucket[] {
  const map = new Map<string, TimeBucket>();

  for (const p of proposals) {
    if (!p.finalisedAt) continue;
    const key = truncateToBucket(p.finalisedAt, granularity);
    const existing = map.get(key);
    if (existing) {
      existing.proposal_count++;
      existing.participation_count += p.uniqueVoters.length;
    } else {
      map.set(key, {
        bucket_start: key,
        granularity,
        proposal_count: 1,
        participation_count: p.uniqueVoters.length,
      });
    }
  }

  return [...map.values()].sort((a, b) => a.bucket_start.localeCompare(b.bucket_start));
}
