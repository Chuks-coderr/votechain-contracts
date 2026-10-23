# ADR-007: Vote Delegation Design

**Status:** Accepted  
**Date:** 2026-09-25  
**Issue:** [#41 — Add delegation support](https://github.com/veracindarella/votechain-contracts/issues/41)

---

## Context

Token holders who cannot actively monitor or participate in governance votes
should be able to assign their voting power to a trusted representative
(delegate) without transferring their tokens. This increases effective
participation rates and is a standard feature of DAO governance systems
(e.g., Compound, Uniswap, OpenZeppelin Governor).

The key design challenge for on-chain delegation in Soroban is that smart
contracts cannot iterate over all delegators to a given address — there is no
enumerable storage. Any implementation must be gas-bounded.

---

## Decision

### Single-level delegation

A delegator may delegate their voting power to exactly one address. Chained
delegation (delegator → delegate → sub-delegate) is explicitly **not**
supported. This keeps the gas model predictable and avoids circular delegation
attacks.

### Pull model via `cast_vote_with_delegators`

The delegate does not automatically accumulate all delegator balances when
they call `cast_vote`. Instead, a separate function `cast_vote_with_delegators`
accepts an explicit list of delegator addresses supplied by the caller.

This is the **pull model**: the delegate (or an off-chain relayer) is
responsible for querying the list of delegators (from an indexer or event log)
and supplying them at vote time.

**Rationale:** Soroban contracts cannot enumerate storage keys, so a push model
(automatically summing all delegators) would require either:
1. An unbounded loop (rejected — gas bomb risk), or
2. A secondary data structure tracking all delegators per delegate (rejected
   — writes a new storage entry for every delegation, O(N) cost on the
   delegate's side).

The pull model costs one storage read + one token balance query per delegator
claimed in a transaction, and the gas cost is bounded by the size of the
supplied list.

### Persistent delegation storage

Delegations are stored in **persistent storage** (`DataKey::Delegation(delegator)`
→ `Address`). This means:

- Delegations survive ledger expiry without requiring renewal.
- A single delegation covers all future proposals until explicitly revoked.
- No per-proposal delegation setup is needed.

### Delegator is blocked from direct voting while delegated

If a delegator calls `cast_vote` directly while their power is delegated, the
contract returns `VotingPowerDelegated`. The delegator must call `undelegate()`
first to reclaim direct voting rights.

This prevents double-counting: the delegator's balance cannot appear in both a
direct vote and a delegate's accumulated weight on the same proposal.

### Delegator is marked as voted when delegate claims their power

When a delegate calls `cast_vote_with_delegators` and a delegator's balance is
accumulated, the delegator is immediately marked as `HasVoted` on that proposal.
This prevents:
- The same delegator being counted twice across multiple `cast_vote_with_delegators`
  calls.
- A scenario where the delegation is revoked between two delegation claims on
  the same proposal.

---

## API

| Function | Description |
|----------|-------------|
| `delegate(env, delegator, delegate)` | Delegate voting power; emits `DelegationSet` |
| `undelegate(env, delegator)` | Revoke delegation; emits `DelegationRevoked` |
| `get_delegate(env, delegator)` | Query current delegate (read-only) |
| `cast_vote_with_delegators(env, voter, proposal_id, vote, delegators)` | Vote with own + delegated power |

---

## Events

| Event | Symbol | Data |
|-------|--------|------|
| `DelegationSet` | `delegset` | `(delegator, delegate)` |
| `DelegationRevoked` | `delegrevk` | `delegator` |

---

## Consequences

### Positive
- Gas-bounded: delegation claim cost = O(delegators supplied in the call).
- No circular delegation possible.
- Persistent delegations reduce UX friction (set once, valid for all proposals).
- Delegator marked as voted prevents any double-counting edge case.

### Negative
- Delegates must maintain an off-chain list of their delegators (via event
  indexer) to supply to `cast_vote_with_delegators`.
- If a delegator revokes between the delegate claiming their power and the end
  of voting, the delegation was already counted (this is acceptable — the
  snapshot was taken at vote time).
- No automatic delegation chaining (this is intentional).

### Neutral
- `cast_vote` behaviour is unchanged for non-delegated voters: existing tests
  and integrations are unaffected.

---

## Alternatives Considered

### A. Automatic accumulation in `cast_vote`
Rejected: requires iterating over all delegators on-chain, which is unbounded.

### B. Snapshot at delegation time
Rejected: balance at delegation time may differ significantly from balance at
vote time. The live-balance model (ADR-003) is preserved for delegation too.

### C. Token-level delegation (ERC-20 Votes style)
Rejected: would require modifying the token contract and breaks the separation
of concerns between the token and governance contracts.

### D. Delegation expiry
Deferred: could be added as a future enhancement (ADR-008) by storing an
optional expiry timestamp alongside the delegation. Not included in this
initial implementation to keep the design simple.
