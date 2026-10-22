/**
 * Proposal routes with Redis caching applied.
 * Replace the stub handlers with real Stellar RPC / indexer calls.
 */

import { Router, Request, Response } from "express";
import {
  cacheProposalList,
  cacheProposalItem,
  getCacheMetrics,
  invalidateProposalCache,
} from "../middleware/redisCache";
import { validateAddressParam } from "../middleware/validation";

const router = Router();

// GET /proposals — cached 30 s
router.get("/proposals", cacheProposalList, async (_req: Request, res: Response) => {
  // TODO: fetch from Stellar RPC / indexer
  const proposals: unknown[] = [];
  res.json(proposals);
});

// GET /proposals/:id — cached 10 s
router.get("/proposals/:id", cacheProposalItem, async (req: Request, res: Response) => {
  const { id } = req.params;
  // TODO: fetch single proposal from Stellar RPC / indexer
  res.json({ id });
});

// POST /proposals/invalidate — called by the event indexer on new on-chain events
router.post("/proposals/invalidate", async (req: Request, res: Response) => {
  const { id } = req.body as { id?: string };
  await invalidateProposalCache(id);
  res.json({ ok: true, invalidated: id ?? "list" });
});

// GET /metrics/cache — exposes hit/miss counters
router.get("/metrics/cache", (_req: Request, res: Response) => {
  res.json(getCacheMetrics());
});

// GET /voters/:address/votes — validate Stellar address before processing
router.get(
  "/voters/:address/votes",
  validateAddressParam("address"),
  async (req: Request, res: Response) => {
    const { address } = req.params;
    // TODO: fetch vote history for voter from indexer
    res.json({ voter: address, votes: [] });
  }
);

export default router;
