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
 * Proposal routes with Redis caching and zod request validation applied.
 * Fetches proposal data from the on-chain governance contract via Soroban RPC.
 */

import { Router, Request, Response } from "express";
import { Keypair } from "@stellar/stellar-sdk";
import {
  cacheProposalList,
  cacheProposalItem,
  getCacheMetrics,
  invalidateProposalCache,
} from "../middleware/redisCache";
import { proposalEtag } from "../middleware/proposalEtag";
import { adminAuth } from "../middleware/adminAuth";
import { validateAddressParam } from "../middleware/validation";
import { ContractService, createContractServiceFromEnv, type Proposal, type ProposalState } from "../services/contractService";

const router = Router();

// Lazy-initialized contract service
let contractService: ContractService | null = null;

function getContractService(): ContractService {
  if (!contractService) {
    contractService = createContractServiceFromEnv();
  }
  return contractService;
}

const VALID_STATES = new Set(["Active", "Passed", "Rejected", "Executed", "Cancelled"]);

/**
 * Predefined tag taxonomy for proposal categorisation (issue #102).
 * Must stay in sync with docs/tags-taxonomy.md.
 */
const PREDEFINED_TAGS = new Set([
  "treasury",
  "technical",
  "community",
  "security",
  "emergency",
  "meta",
  "protocol",
  "grants",
]);

/**
 * Sanitises a full-text search query.
 */
function sanitiseSearchQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 200);
}

/**
 * Transform contract Proposal to API response format.
 */
function transformProposal(p: Proposal): Record<string, unknown> {
  return {
    id: Number(p.id),
    title: p.title,
    description: p.description,
    state: p.state,
    proposer: p.proposer,
    votes_yes: Number(p.votesYes),
    votes_no: Number(p.votesNo),
    votes_abstain: Number(p.votesAbstain),
    quorum: Number(p.quorum),
    start_time: Number(p.startTime),
    end_time: Number(p.endTime),
    execute_after: Number(p.executeAfter),
    // proposal_tags not stored on-chain yet; return empty array for compatibility
    proposal_tags: [],
  };
}

// GET /proposals — cached 30 s
// Supports ?state= for state filtering, ?cursor= and ?limit= for pagination.
router.get("/proposals", proposalEtag, cacheProposalList, async (req: Request, res: Response) => {
  try {
    const service = getContractService();

    // Pagination: cursor = last seen proposal_id, limit default 20, max 100.
    const rawLimit = Number.parseInt(String(req.query.limit ?? "20"), 10);
    const limit = Number.isNaN(rawLimit) ? 20 : Math.min(100, Math.max(1, rawLimit));

    const cursor = typeof req.query.cursor === "string" && req.query.cursor !== ""
      ? Number.parseInt(req.query.cursor, 10)
      : undefined;

    if (cursor !== undefined && (Number.isNaN(cursor) || cursor < 0)) {
      return res.status(400).json({ error: "cursor must be a non-negative integer proposal ID" });
    }

    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    if (state && !VALID_STATES.has(state)) {
      return res.status(400).json({ error: "Invalid proposal state" });
    }

    // Issue #102: tag-based filtering (not yet supported on-chain)
    const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
    if (tag !== undefined) {
      const normalisedTag = tag.toLowerCase();
      if (!PREDEFINED_TAGS.has(normalisedTag)) {
        return res.status(400).json({
          error: `Invalid tag. Allowed tags: ${[...PREDEFINED_TAGS].join(", ")}`,
        });
      }
    }

    // Use a funded account to simulate read calls.
    // In production, this could be a dedicated read-only account.
    // For now, use the admin account or any funded account.
    const readAs = getConfig().readAccount;
    if (!readAs) {
      return res.status(500).json({ error: "READ_ACCOUNT or SOROBAN_ACCOUNT not configured for contract reads" });
    }

    // Fetch proposals from contract (offset-based for now; contract uses offset/limit)
    // Note: cursor pagination would require fetching all and filtering, which is inefficient.
    // For now, we use offset=0 and apply cursor filtering in-memory.
    const offset = cursor !== undefined ? BigInt(cursor) : BigInt(0);
    const fetchLimit = BigInt(limit + 1); // fetch one extra to check hasMore
    const proposals = await service.listProposals(readAs, offset, fetchLimit);

    // Filter by state if requested
    let filtered = proposals;
    if (state) {
      filtered = filtered.filter((p) => p.state === state);
    }

    // Tag filtering not supported on-chain yet; would need off-chain indexer
    if (tag) {
      // No-op for now; tags not stored on-chain
    }

    // Sort descending by id (most recent first)
    filtered.sort((a, b) => (b.id > a.id ? 1 : -1));
    const data = filtered.slice(0, limit);

    // next_cursor is the id of the last item returned; absent when no more pages.
    const hasMore = filtered.length > limit;
    const next_cursor = hasMore && data.length > 0 ? String(data[data.length - 1].id) : undefined;

    const response = {
      data: data.map(transformProposal),
      pagination: {
        limit,
        has_more: hasMore,
        ...(next_cursor !== undefined ? { next_cursor } : {}),
        ...(cursor !== undefined ? { cursor: String(cursor) } : {}),
        ...(state ? { state } : {}),
        ...(tag ? { tag: tag.toLowerCase() } : {}),
      },
    };

    res.json(response);
  } catch (err: unknown) {
    console.error("[GET /proposals] Error:", err);
    res.status(500).json({ error: (err as Error).message ?? "Failed to fetch proposals" });
  }
});

// GET /proposals/:id — cached 10 s
router.get("/proposals/:id", proposalEtag, cacheProposalItem, async (req: Request, res: Response) => {
  try {
    const service = getContractService();
    const { id } = req.params;
    const proposalId = BigInt(id);

    const readAs = getConfig().readAccount;
    if (!readAs) {
      return res.status(500).json({ error: "READ_ACCOUNT or SOROBAN_ACCOUNT not configured for contract reads" });
    }

    const proposal = await service.getProposal(readAs, proposalId);
    res.json(transformProposal(proposal));
  } catch (err: unknown) {
    console.error("[GET /proposals/:id] Error:", err);
    const message = (err as Error).message ?? "Failed to fetch proposal";
    if (message.includes("not found") || message.includes("ProposalNotFound")) {
      res.status(404).json({ error: "Proposal not found" });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// POST /proposals — create a new proposal on-chain
router.post("/proposals", async (req: Request, res: Response) => {
  try {
    const { title, description, quorum, duration, proposer } = req.body as {
      title: string;
      description: string;
      quorum: number;
      duration: number;
      proposer?: string;
    };

    // Validation (mirrors frontend and contract validation)
    if (!title || title.length > 128) {
      return res.status(400).json({ error: "Title must be 1-128 characters" });
    }
    if (!description || description.length > 1024) {
      return res.status(400).json({ error: "Description must be 1-1024 characters" });
    }
    if (!Number.isInteger(quorum) || quorum <= 0) {
      return res.status(400).json({ error: "Quorum must be a positive integer" });
    }
    if (!Number.isInteger(duration) || duration < 60 || duration > 2_592_000) {
      return res.status(400).json({ error: "Duration must be between 60 and 2,592,000 seconds (1 min - 30 days)" });
    }

    const service = getContractService();

    // Use proposer from request or default to admin account
    const proposerAddress = proposer ?? getConfig().sorobanAccount;
    if (!proposerAddress) {
      return res.status(500).json({ error: "Proposer address not provided and SOROBAN_ACCOUNT not configured" });
    }

    // The proposer must sign the transaction. In a real app, this would be done
    // via Freighter on the frontend. For the backend API, we need the proposer's
    // secret key to sign. This is a simplified implementation for the MVP.
    // In production, the frontend would build and sign the transaction, then
    // submit the signed XDR to the backend or directly to the network.
    const proposerSecret = getConfig().proposerSecret;
    if (!proposerSecret) {
      return res.status(500).json({ error: "Proposer secret key not configured (PROPOSER_SECRET_KEY or SOROBAN_SECRET_KEY)" });
    }

    const signerKeypair = Keypair.fromSecret(proposerSecret);

    // Verify the signer matches the proposer address
    if (signerKeypair.publicKey() !== proposerAddress) {
      return res.status(400).json({ error: "Proposer secret key does not match proposer address" });
    }

    const result = await service.createProposal(signerKeypair, {
      proposer: proposerAddress,
      title,
      description,
      quorum: BigInt(quorum),
      durationSeconds: BigInt(duration),
    });

    res.status(201).json({ id: Number(result.value), hash: result.hash });
  } catch (err: unknown) {
    console.error("[POST /proposals] Error:", err);
    res.status(500).json({ error: (err as Error).message ?? "Failed to create proposal" });
  }
});

// POST /proposals/:id/finalize — finalize a proposal after voting ends
router.post("/proposals/:id/finalize", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const proposalId = BigInt(id);

    const service = getContractService();

    // Anyone can call finalize; use a funded account to pay fees
    const finalizerSecret = getConfig().finalizerSecret;
    if (!finalizerSecret) {
      return res.status(500).json({ error: "Finalizer secret key not configured" });
    }

    const signerKeypair = Keypair.fromSecret(finalizerSecret);

    const result = await service.finalise(signerKeypair, proposalId);

    res.json({ ok: true, hash: result.hash });
  } catch (err: unknown) {
    console.error("[POST /proposals/:id/finalize] Error:", err);
    const message = (err as Error).message ?? "Failed to finalize proposal";
    if (message.includes("VotingStillOpen")) {
      res.status(400).json({ error: "Voting period has not ended yet" });
    } else if (message.includes("ProposalNotActive")) {
      res.status(400).json({ error: "Proposal is not active" });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// POST /proposals/:id/execute — execute a passed proposal (admin only)
router.post("/proposals/:id/execute", adminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const proposalId = BigInt(id);

    const service = getContractService();

    // Admin must sign the execution
    const adminSecret = getConfig().adminSecret;
    if (!adminSecret) {
      return res.status(500).json({ error: "Admin secret key not configured" });
    }

    const adminKeypair = Keypair.fromSecret(adminSecret);
    const adminAddress = adminKeypair.publicKey();

    const result = await service.execute(adminKeypair, adminAddress, proposalId);

    res.json({ ok: true, hash: result.hash });
  } catch (err: unknown) {
    console.error("[POST /proposals/:id/execute] Error:", err);
    const message = (err as Error).message ?? "Failed to execute proposal";
    if (message.includes("ProposalNotPassed")) {
      res.status(400).json({ error: "Proposal has not passed" });
    } else if (message.includes("TimelockNotExpired")) {
      res.status(400).json({ error: "Timelock has not expired" });
    } else if (message.includes("NotAdmin")) {
      res.status(403).json({ error: "Caller is not the admin" });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// POST /proposals/invalidate — admin-only; protected by JWT auth middleware
router.post("/proposals/invalidate", adminAuth, async (req: Request, res: Response) => {
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
    try {
      const service = getContractService();
      const { address } = req.params;

      const readAs = getConfig().readAccount;
      if (!readAs) {
        return res.status(500).json({ error: "READ_ACCOUNT or SOROBAN_ACCOUNT not configured for contract reads" });
      }

      // This would require an indexer or iterating through all proposals
      // For now, return empty array as the contract doesn't have a batch voter query
      res.json({ voter: address, votes: [] });
    } catch (err: unknown) {
      console.error("[GET /voters/:address/votes] Error:", err);
      res.status(500).json({ error: (err as Error).message ?? "Failed to fetch vote history" });
    }
  }
);

export default router;