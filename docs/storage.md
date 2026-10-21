# Storage Data Dictionary

This document catalogs all on-chain storage keys and core data structures used by the VoteChain contracts.

## Governance Contract (`contracts/governance`)

### Storage Key Enum: `DataKey`

| Key | Payload Type | Storage Tier | Purpose |
|---|---|---|---|
| `Proposal(u64)` | `Proposal` | Persistent | Stores proposal record by proposal ID. |
| `ProposalCount` | `u64` | Instance | Monotonic counter for next proposal ID. |
| `HasVoted(u64, Address)` | `bool` | Persistent | Fast flag for duplicate-vote checks per proposal + voter. |
| `VoteRecord(u64, Address)` | `VoteRecord` | Persistent | Stores full vote choice + vote weight for auditability. |
| `VoterSnapshot(u64, Address)` | `i128` | Persistent | Stores token-balance snapshot at vote time per voter/proposal. |
| `LastProposal(Address)` | `u64` | Persistent | Stores last proposal timestamp per proposer for cooldown checks. |
| `Admin` | `Address` | Instance | Governance admin account. |
| `VotingToken` | `Address` | Instance | Token contract used for vote weight and proposal threshold checks. |
| `MinProposalBalance` | `i128` | Instance | Minimum token balance required to create a proposal. |
| `ProposalCooldown` | `u64` | Instance | Cooldown in seconds between proposals per proposer. |
| `Version` | `(u32, u32, u32)` | Instance | Contract semantic version tuple `(major, minor, patch)`. |
| `ContractState` | `ContractState` | Instance | Governance contract lifecycle state. |

### Structs

#### `Proposal`

| Field | Type | Description / Constraints |
|---|---|---|
| `id` | `u64` | Unique proposal identifier. |
| `proposer` | `Address` | Address that created the proposal. |
| `title` | `String` | Human-readable proposal title. Length validated in contract. |
| `description` | `String` | Proposal details. Length validated in contract. |
| `votes_yes` | `i128` | Running weighted tally for `Yes` votes. |
| `votes_no` | `i128` | Running weighted tally for `No` votes. |
| `votes_abstain` | `i128` | Running weighted tally for `Abstain` votes. |
| `quorum` | `i128` | Minimum total vote weight required to finalise with quorum. |
| `start_time` | `u64` | Voting start timestamp (ledger time). |
| `end_time` | `u64` | Voting end timestamp (ledger time). |
| `state` | `ProposalState` | Current proposal lifecycle state. |

#### `VoteRecord`

| Field | Type | Description / Constraints |
|---|---|---|
| `vote_type` | `Vote` | Voter's selected option (`Yes`, `No`, `Abstain`). |
| `weight` | `i128` | Snapshotted vote weight used for this vote. |

### Enums

#### `ContractState`
- `Uninitialized`: contract deployed but not initialized.
- `Ready`: contract initialized and operational.

#### `ProposalState`
- `Active`: proposal is currently open for voting.
- `Passed`: voting ended and proposal met pass conditions.
- `Rejected`: voting ended and proposal failed.
- `Executed`: passed proposal has been executed.
- `Cancelled`: proposal was cancelled.

#### `Vote`
- `Yes`: affirmative vote.
- `No`: negative vote.
- `Abstain`: abstention.

#### `ContractError` (Governance)
- `AdminNotSet`
- `NotAdmin`
- `VotingTokenNotSet`
- `InvalidQuorum`
- `InvalidDuration`
- `ProposalNotFound`
- `ProposalNotActive`
- `VotingPeriodEnded`
- `VotingStillOpen`
- `AlreadyVoted`
- `NoVotingPower`
- `ProposalNotPassed`
- `AlreadyInitialized`
- `VoteTallyOverflow`
- `InsufficientBalance`
- `ProposalCooldown`
- `TitleTooLong`
- `DescriptionTooLong`
- `InvalidTitle`
- `InvalidDescription`
- `InvalidDurationRange`
- `QuorumExceedsSupply`

## Token Contract (`contracts/token`)

### Storage Key Enum: `TokenDataKey`

| Key | Payload Type | Storage Tier | Purpose |
|---|---|---|---|
| `Balance(Address)` | `i128` | Persistent | Token balance per holder address. |
| `Allowance(Address, Address)` | `i128` | Temporary | Spending allowance from owner to spender. |
| `TotalSupply` | `i128` | Instance | Aggregate circulating token supply. |
| `Admin` | `Address` | Instance | Token admin address (mint/burn/admin operations). |
| `Version` | `(u32, u32, u32)` | Instance | Contract semantic version tuple `(major, minor, patch)`. |

### Enums

#### `ContractError` (Token)
- `AdminNotSet`
- `NotAdmin`
- `InvalidAmount`
- `InsufficientBalance`
- `AllowanceExceeded`
- `InvalidNewAdmin`

## Notes on Storage Isolation

- Governance and token contracts each namespace storage with contract-specific key enums (`DataKey`, `TokenDataKey`).
- Soroban serializes enum discriminants as part of the key, so variants cannot collide even when payload shapes match.
- Instance keys are singleton config/state values.
- Persistent keys hold long-lived per-entity state.
- Temporary keys are used for short-lived allowances.

## TTL Bump Strategy (Issue #43)

Soroban persistent storage entries expire after their TTL (time-to-live) elapses without being bumped. Long-lived proposals (up to 30-day voting windows) risk having their storage entries silently evicted mid-vote unless the TTL is actively maintained.

### Constants

| Constant | Value (ledgers ≈ seconds) | Meaning |
|---|---|---|
| `TTL_MIN_LEDGERS` | 2,592,000 | 30 days — bump threshold: skip the bump when the remaining TTL exceeds this value |
| `TTL_MAX_LEDGERS` | 3,110,400 | 36 days — target TTL after a bump (matches Stellar's persistent-entry bump amount) |

At approximately 1 ledger per second these constants translate directly to seconds.

### When Bumps Fire

`extend_ttl(key, TTL_MIN_LEDGERS, TTL_MAX_LEDGERS)` is called on the `Proposal(id)` storage key:

- **`save_proposal`** — after every write (proposal creation, vote tally update, state transition).
- **`load_proposal`** — on every successful read (vote validation, finalisation, execution).

This ensures that any code path touching a proposal also refreshes its TTL, without requiring a separate keeper bot.

### Cost Implications

Each `extend_ttl` call costs one additional host-function invocation. The cost is proportional to the size of the storage entry being bumped (the `Proposal` struct). In practice this adds a small constant overhead to every `create_proposal`, `cast_vote`, `finalise`, `execute`, and `cancel` call. The overhead is bounded and well within the per-invocation resource limits of Soroban.

For high-frequency access patterns (e.g., a very popular proposal with many voters) the bump is effectively free because Soroban skips the ledger-level update when the remaining TTL already exceeds `TTL_MIN_LEDGERS`.

References:
- [Soroban State Expiration](https://developers.stellar.org/docs/learn/soroban/storage/state-expiration)
- [CAP-0046: State Expiration](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0046.md)

## Off-Chain Indexer Storage

The off-chain indexer uses PostgreSQL to mirror on-chain proposal data for fast querying.

### `proposals` Table

| Column | Type | Description |
|---|---|---|
| `id` | `BIGINT` | Proposal ID (from on-chain counter) |
| `title` | `TEXT` | Proposal title |
| `description` | `TEXT` | Proposal description |
| `state` | `TEXT` | Current state (`active`, `passed`, `rejected`, `executed`, `cancelled`) |
| `proposer` | `TEXT` | Proposer address |
| `votes_yes` | `NUMERIC` | Weighted yes-vote tally |
| `votes_no` | `NUMERIC` | Weighted no-vote tally |
| `votes_abstain` | `NUMERIC` | Weighted abstain-vote tally |
| `quorum` | `NUMERIC` | Minimum total votes required |
| `start_time` | `BIGINT` | Voting start Unix timestamp |
| `end_time` | `BIGINT` | Voting end Unix timestamp |
| `execute_after` | `BIGINT` | Earliest execution Unix timestamp (0 if not passed) |
| `search_vector` | `tsvector` (generated) | Full-text search vector combining title (A) and description (B) |

### Full-Text Search Index (Issue #40)

Migration `003_add_proposal_search.sql` adds a generated `tsvector` column and a GIN index:

```sql
ALTER TABLE proposals
  ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED;

CREATE INDEX proposals_search_idx ON proposals USING GIN (search_vector);
```

- **Weight A** (title) — title matches score higher than description matches.
- **Weight B** (description) — matched but ranked lower than title hits.
- The `'english'` dictionary applies stemming and stop-word removal (case-insensitive by default).
- Queries use `websearch_to_tsquery('english', $1)` with parameterised input to prevent SQL injection.
- Results are ordered by `ts_rank` (relevance) when a `?q=` parameter is present, and by `id DESC` otherwise.
