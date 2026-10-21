# ADR-013: Governance Token Staking for Time-Weighted Voting Power (ve-token Model)

**Status:** Proposed  
**Date:** 2026-09-29  
**Issue:** [#116 — Add governance token staking for time-weighted voting power](https://github.com/veracindarella/votechain-contracts/issues/116)

## Context

### Whale Dominance Problem

VoteChain currently uses a raw token balance as voting weight (ADR-002).  This
means that any address that acquires a large token holding immediately gains
proportional governance influence — including addresses that purchased tokens
moments before a vote and plan to sell immediately after.  Short-term holders
can sway outcomes without bearing the long-term consequences of their votes,
creating a **whale dominance** and **governance mercenary** problem:

- A well-capitalised actor can buy tokens, vote on a favourable proposal, and
  dump the tokens within the same block or transaction window.
- Retail holders who believe in the long-term project are systematically
  under-represented relative to short-term opportunists.
- Quorum thresholds (ADR-002) help, but do not address the alignment problem.

### Time-Weighted Incentives

A common solution, pioneered by Curve Finance's **veCRV** model and adopted by
many DAOs, is to reward *commitment*: participants who lock their tokens for
longer periods receive a higher voting-power multiplier.  This approach:

1. **Aligns incentives** — voters bear the consequences of their votes during
   the lock period.
2. **Reduces governance attacks** — acquiring a large, time-boosted position
   requires sustained capital commitment, not a flash loan.
3. **Rewards long-term holders** — committed community members gain
   proportionally more influence over governance.

### Constraints

- VoteChain runs on Soroban (Stellar Protocol 22+), which prohibits
  floating-point arithmetic in contracts.  All multipliers must use
  fixed-point integer arithmetic.
- Soroban's execution model prevents reentrancy (see SEC-010), but lock
  enforcement must be applied in the `transfer` / `transfer_from` code path
  (see SEC-013).
- Storage costs on Soroban are proportional to the number of entries.  A
  single `StakeRecord` per address keeps the storage footprint minimal.
- The v1 implementation supports **one active staking position per address**
  for simplicity.  Multiple positions per address may be added in a future
  milestone.

## Decision

Implement a **ve-token (vote-escrowed token) model** inside the existing token
contract (`contracts/token`):

### 1. Staking API

Add three new entry points to the token contract:

| Function | Caller | Description |
|----------|--------|-------------|
| `stake(staker, amount, lock_duration_seconds)` | Staker | Lock `amount` tokens for `lock_duration_seconds` |
| `unstake(staker)` | Staker | Release tokens after lock expires |
| `staked_voting_power(staker)` | Anyone (governance) | Return effective voting power |

### 2. Voting-Power Multiplier

The multiplier scales **linearly** from **1× at 0 days** to **4× at 365 days**:

```
lock_duration_days = lock_duration_seconds / 86_400
multiplier         = 1 + 3 × (lock_duration_days / 365)
```

This is implemented with fixed-point integer arithmetic using
`MULTIPLIER_PRECISION = 10_000`.

**Rationale for linear scaling:** A linear formula is the simplest choice that
satisfies the product requirement (1×–4× range) and is easily auditable.
Quadratic or logarithmic curves were considered but add complexity without a
clear benefit given the defined range.

**Rationale for 4× maximum:** A 4× ceiling prevents extreme concentration of
power in long-term stakers while still providing a meaningful incentive.  It is
consistent with the range used by several major ve-token deployments.

### 3. Transfer Freeze

During the lock period, staked tokens are removed from the transferable balance.
The `transfer` and `transfer_from` functions must check:

```
if env.ledger().timestamp() < stake_record.locked_until {
    // staked tokens are frozen — transferable balance = total_balance - staked_amount
}
```

### 4. Governance Integration

The governance contract's `cast_vote` function will be updated to call
`token_client.staked_voting_power(&voter)` instead of `token_client.balance(&voter)`.
This is a non-breaking change: addresses without a staking position receive a
1× multiplier (raw balance), preserving full backwards compatibility.

### 5. Storage

A new persistent-storage key `TokenDataKey::StakeRecord(Address)` will store
the [`StakeRecord`] struct:

```rust
pub struct StakeRecord {
    pub staker:        Address,
    pub amount:        i128,
    pub lock_duration: u64,   // seconds
    pub locked_until:  u64,   // Unix timestamp
}
```

### Alternatives Considered

| Alternative | Reason not chosen |
|-------------|------------------|
| Quadratic voting | Does not address holding-period alignment; different problem |
| Snapshot-based voting power (block at proposal creation) | Prevents flash-loan stake attacks but requires snapshotting infrastructure not yet in VoteChain |
| Multiple stake positions per address | Added complexity deferred to a future milestone |
| External staking contract | Increases cross-contract call surface and attack area; keeping staking in the token contract is simpler for v1 |
| Non-linear multiplier (e.g., square root) | More complex without a clear benefit given the 1×–4× requirement |

## Consequences

### Positive

- Long-term aligned holders gain proportionally more governance influence.
- Flash-loan governance attacks become significantly more costly (see SEC-013).
- The design is backwards compatible — non-stakers continue to vote with raw
  balance (effectively 1× multiplier).
- The ve-token model is well-understood and widely audited in the broader DeFi
  ecosystem, reducing novel-design risk.

### Negative / Trade-offs

- **Liquidity reduction:** Stakers sacrifice token liquidity for the lock
  period.  This is intentional and documented as a known trade-off.
- **Transfer enforcement complexity:** Every `transfer` and `transfer_from`
  call must consult the staking record, adding a storage read to each
  transfer.  This is a modest but real increase in gas cost.
- **Single position per address (v1):** Users who want to partially unstake or
  adjust their lock must wait for the current lock to expire.
- **No early-exit mechanism:** Tokens are locked until `locked_until`.  An
  early-exit penalty mechanism (common in some ve-token designs) is deferred
  to a future milestone.
- **Governance integration required:** The governance contract must be updated
  to call `staked_voting_power` instead of `balance`; this is a coordinated
  change across two contracts.

### Follow-up Work Required

- [ ] Implement `stake`, `unstake`, `staked_voting_power` in `staking.rs`
- [ ] Add `TokenDataKey::StakeRecord(Address)` to `types.rs`
- [ ] Add `StakeLocked`, `StakeNotFound`, `AlreadyStaked`, `InvalidLockDuration`
      error variants to `ContractError` in `types.rs`
- [ ] Enforce transfer freeze in `transfer` and `transfer_from` in `lib.rs`
- [ ] Update governance `cast_vote` to use `staked_voting_power`
- [ ] Add staking events to `events.rs`
- [ ] Write comprehensive unit tests for all staking paths
- [ ] Update SEC-013 with implementation findings
- [ ] Update the token contract public API documentation

---

## References

- [Issue #116](https://github.com/veracindarella/votechain-contracts/issues/116) — Feature request
- [ADR-002](ADR-002-token-weighted-voting.md) — Token-weighted voting (superseded for stakers)
- [ADR-003](ADR-003-live-balance-over-snapshot.md) — Live balance model
- [SEC-013](../security/SEC-013-staking-lock-bypass.md) — Lock-bypass security analysis
- [contracts/token/src/staking.rs](../../contracts/token/src/staking.rs) — Implementation scaffold
- Curve Finance veCRV whitepaper: https://curve.fi/files/CurveDAO.pdf
- Soroban storage documentation: https://developers.stellar.org/docs/learn/smart-contract-internals/persisting-data
