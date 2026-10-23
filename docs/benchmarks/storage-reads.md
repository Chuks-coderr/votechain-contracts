# Storage Read Benchmarks — Hot Paths

**Issue:** [#59](https://github.com/veracindarella/votechain-contracts/issues/59)  
**Last updated:** 2026-09-28  
**Soroban SDK version:** 22.0.0

---

## Overview

Soroban charges instruction fees for every storage read. This document profiles
the storage reads performed in the three hottest contract entry points
(`cast_vote`, `create_proposal`, `finalise`) and records any optimisations made
to eliminate redundant reads.

Instruction counts below are **estimates** derived from the Soroban
simulation model. Actual counts vary with payload size (address length,
string length, etc.). The target budget per call is **≤ 1,000,000 instructions**.

---

## Storage Tier Reference

| Tier       | Cost model                                    | Keys used in governance contract                        |
|------------|-----------------------------------------------|---------------------------------------------------------|
| Instance   | Loaded once per invocation as a single bucket | Admin, VotingToken, Paused, RestrictAdminVote, …       |
| Persistent | One host-function call per key                | Proposal, HasVoted, VoteRecord, VoterSnapshot, …       |
| Temporary  | Not used in governance contract               | —                                                       |

Instance storage reads are **effectively free** after the first read per
invocation because the host loads the entire instance bucket up front. All
instance reads within one call share that single load cost.

Persistent storage reads each cost approximately **8,000–12,000 instructions**
depending on value size.

---

## `cast_vote` — Storage Read Profile

### Read sequence (optimised, post #59)

| # | Key                              | Tier       | Notes                                              |
|---|----------------------------------|------------|----------------------------------------------------|
| 1 | `Paused`                         | Instance   | Free (part of instance bucket load)                |
| 2 | `Proposal(proposal_id)`          | Persistent | Load full proposal; also validates existence       |
| 3 | `HasVoted(proposal_id, voter)`   | Persistent | Double-vote guard                                  |
| 4 | `Delegation(voter)`              | Persistent | Check that voter has not delegated their power     |
| 5 | `RestrictAdminVote`              | Instance   | Free (instance bucket already loaded)              |
| 6 | `Admin`                          | Instance   | Free — read only when RestrictAdminVote = true     |
| 7 | `VotingToken`                    | Instance   | Free — one read, address passed to token client    |
| 8 | `VoterSnapshot(proposal_id, voter)` | Persistent | Snapshot dedup: returns early if already stored |

**Persistent reads:** 4 (Proposal, HasVoted, Delegation, VoterSnapshot)  
**Instance reads:** effectively 1 (shared bucket)  
**Estimated total instructions:** ~460,000–520,000  
**Budget headroom:** ≥ 480,000 instructions remaining

### Notes

- `VoterSnapshot` is written only on the first vote; subsequent calls to
  `cast_vote` for the same voter read it and return early without a token
  cross-contract call, saving ~30,000–50,000 instructions.
- The token cross-contract `balance()` call is the most expensive single
  operation (~80,000–120,000 instructions) and is skipped when the snapshot
  already exists.

---

## `create_proposal` — Storage Read Profile

### Read sequence (optimised, post #59)

| # | Key                      | Tier       | Notes                                                       |
|---|--------------------------|------------|-------------------------------------------------------------|
| 1 | `Paused`                 | Instance   | Free (instance bucket)                                      |
| 2 | `MinDuration`            | Instance   | Free                                                        |
| 3 | `MaxDuration`            | Instance   | Free                                                        |
| 4 | `VotingToken`            | Instance   | **Read once** — address reused for both token client and    |
|   |                          |            | `TokenSupplyClient` (duplicate eliminated in #59)           |
| 5 | `MinProposalBalance`     | Instance   | Free                                                        |
| 6 | `ProposalCooldown`       | Instance   | Free                                                        |
| 7 | `LastProposal(proposer)` | Persistent | Cooldown check                                              |
| 8 | `MaxActiveProposals`     | Instance   | Free                                                        |
| 9 | `ActiveProposalsCount`   | Instance   | Free                                                        |
| 10| `ProposalCount`          | Instance   | Free — ID generation                                        |

**Persistent reads:** 1 (LastProposal — skipped when cooldown = 0)  
**Cross-contract calls:** 1 (`total_supply`) + 1 (`balance` when min_balance > 0)  
**Estimated total instructions:** ~350,000–500,000

### Optimisation applied (#59)

Before this fix `get_voting_token` was called **twice** in `create_proposal_internal`:

```rust
// BEFORE (two instance reads)
let token_client = token::Client::new(&env, &get_voting_token(&env)?);
let supply = TokenSupplyClient::new(&env, &get_voting_token(&env)?).total_supply();
```

After:

```rust
// AFTER (one instance read, address reused via local variable)
let voting_token = get_voting_token(&env)?;          // single read
let token_client = token::Client::new(&env, &voting_token);
let supply = TokenSupplyClient::new(&env, &voting_token).total_supply();
```

Saving: 1 instance read per `create_proposal` call.

---

## `finalise` — Storage Read Profile

### Read sequence

| # | Key                     | Tier       | Notes                               |
|---|-------------------------|------------|-------------------------------------|
| 1 | `Paused`                | Instance   | Free                                |
| 2 | `Proposal(proposal_id)` | Persistent | Load + state check + tally          |
| 3 | `TimelockDuration`      | Instance   | Free                                |

**Persistent reads:** 1  
**Estimated total instructions:** ~200,000–280,000  
**Budget headroom:** ≥ 720,000 instructions remaining

`finalise` is the cheapest hot path. It performs purely arithmetic work on
pre-tallied counters and a single proposal load.

---

## Budget Summary

| Entry point       | Est. instructions | Budget (1,000,000) | Margin     |
|-------------------|------------------:|-------------------:|------------|
| `cast_vote`       |     ~460,000–520,000 |       1,000,000   | ≥ 48 %   |
| `create_proposal` |     ~350,000–500,000 |       1,000,000   | ≥ 50 %   |
| `finalise`        |     ~200,000–280,000 |       1,000,000   | ≥ 72 %   |

All three entry points are comfortably within the 1,000,000-instruction budget.

---

## CI Regression Guard

The `make test` target runs the full unit-test suite which exercises all three
hot paths. Any instruction-fee regression that causes a Soroban simulation to
fail will surface as a test failure.

For tighter budget enforcement, integrate `stellar contract invoke --simulate`
in CI with `--cost` flags once a local Stellar node is available in the CI
environment. See `scripts/test_wasm.sh` for the WASM test harness template.

---

## Future Work

- Add `#[test] fn estimate_instructions_cast_vote()` using `soroban_sdk::testutils::budget()`
  to assert `< 1_000_000` instructions programmatically (blocked on SDK budget API availability).
- Profile `cast_vote_with_delegators` — each additional delegator adds two persistent
  reads, so the budget per delegator batch must be bounded.
