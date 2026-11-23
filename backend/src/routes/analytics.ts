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

import { Router, Request, Response } from "express";
import { getGovernanceAnalytics } from "../services/analyticsService";
import { getRedis } from "../middleware/redisCache";
import { aggregateIntoBuckets, BucketGranularity } from "../services/analyticsAggregation";

const router = Router();

/**
 * GET /governance/analytics
 *
 * Returns the governance health metrics backing GovernanceDashboard.tsx
 * (issue #104): participation rate per proposal, 30-day pass rate, average
 * quorum fill rate, and voter retention. Cached in Redis for 60 seconds so
 * the dashboard's 60-second polling interval does not recompute on every
 * request.
 */
router.get("/governance/analytics", async (_req: Request, res: Response) => {
  try {
    const analytics = await getGovernanceAnalytics(getRedis());
    return res.json(analytics);
  } catch (error) {
    console.error("[Analytics] Error computing governance analytics:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /governance/analytics/buckets
 *
 * Returns time-bucketed participation and proposal counts.
 * Query param: granularity=hourly|daily  (default: daily)
 *
 * Accepts a JSON body with a `proposals` array for the input data.
 * In production this would pull from the indexer; here it accepts the data
 * directly so the endpoint is testable without a live DB.
 */
router.post("/governance/analytics/buckets", (req: Request, res: Response) => {
  const granularity: BucketGranularity =
    req.query.granularity === "hourly" ? "hourly" : "daily";
  const proposals = req.body?.proposals;

  if (!Array.isArray(proposals)) {
    return res.status(400).json({ error: "'proposals' must be an array" });
  }

  const buckets = aggregateIntoBuckets(proposals, granularity);
  return res.json({ granularity, buckets });
});

export default router;
