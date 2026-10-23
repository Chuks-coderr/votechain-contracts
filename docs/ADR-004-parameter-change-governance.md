# ADR-004 — Parameter Change Governance Model

**Date:** 2026-09-26  
**Status:** Accepted  
**Author:** VoteChain Contributors  
**Supercedes:** None  
**Related Issues:** #118, SC-020 (future)  

---

## 1. Decision

Implement a parameter change proposal mechanism that allows DAOs to update contract configuration (quorum, durations, cooldowns, etc.) through governance votes, rather than admin unilateral control.

---

## 2. Context

### 2.1 Current State (v0.1.x)

In VoteChain v0.1.x, contract configuration parameters are immutable after initialization:
- `min_proposal_balance`
- `proposal_cooldown`
- `timelock_duration`
- `min_duration` / `max_duration`

Only the admin can call `update_quorum` on individual proposals. There is no mechanism for token holders to collectively decide whether to adjust contract-wide parameters.

### 2.2 Problem Statement

As DAOs evolve, they often need to adjust governance parameters:
- **Proposal friction:** If proposal cooldown is too high, legitimate activity is throttled. If too low, spam proposals become a problem.
- **Voting windows:** Min/max duration constraints may be optimal for one governance phase but misaligned for another.
- **Economic parameters:** Min proposal balance should scale with token price and DAO size.

Currently, changing these parameters requires:
1. Admin keys to sign the update directly, or
2. Re-deploying the contract (not feasible for production DAOs)

The first approach concentrates power in the admin. The second is operationally infeasible. Neither allows token holders to propose and vote on configuration changes.

### 2.3 Design Goals

1. **Governance-driven:** Parameter changes are proposed and voted on, just like any governance decision.
2. **Transparent & auditable:** All configuration changes are recorded in proposal history with vote tallies.
3. **Emergency override:** Admin retains an emergency escape hatch (with longer timelock) to respond to critical issues.
4. **Limited scope (v0.1.1):** Support only atomic parameter changes via `ConfigKey` enum. Multi-parameter proposals and conditional logic are deferred to v0.2.0.

---

## 3. Decision

### 3.1 New Proposal Type: ParameterChange

Extend the `Proposal` struct to include a `proposal_type` field:

```rust
#[contracttype]
pub enum ProposalType {
    Standard,
    ParameterChange { key: ConfigKey, value: u64 },
}

#[contracttype]
pub enum ConfigKey {
    MinProposalBalance,
    ProposalCooldown,
    TimelockDuration,
    MinDuration,
    MaxDuration,
}
```

When a `ParameterChange` proposal is executed:
1. The new value is validated semantically (e.g., durations must be > 0).
2. The parameter is updated atomically in contract storage.
3. The change takes effect immediately for all subsequent operations.

### 3.2 New Public Functions

#### `create_parameter_change_proposal()`

Allows any token holder (subject to min balance and cooldown) to propose a configuration change:

```rust
pub fn create_parameter_change_proposal(
    env: Env,
    proposer: Address,
    title: String,
    description: String,
    quorum: i128,
    duration: u64,
    config_key: ConfigKey,
    new_value: u64,
) -> Result<u64, ContractError>
```

Validation:
- Same as `create_proposal()` (quorum, title length, etc.)
- Plus semantic validation of the `(key, value)` pair (e.g., min_duration > 0)

#### `execute_parameter_change_override()`

Allows the admin to unilaterally change parameters with an explicit event (no proposal required):

```rust
pub fn execute_parameter_change_override(
    env: Env,
    admin: Address,
    config_key: ConfigKey,
    new_value: u64,
) -> Result<(), ContractError>
```

Design rationale:
- **Emergency escape hatch:** If a bug is discovered or attack imminent, admin can respond quickly without waiting for a proposal vote.
- **No timelock on override:** The override applies immediately. This is acceptable because:
  1. The admin is trusted (by contract deployment).
  2. Override events are emitted and visible on-chain.
  3. Token holders can respond by exiting, delegating, or organizing a counter-vote on a future proposal.

### 3.3 Execution Flow

Standard parameter change proposal:

```
1. Proposer calls create_parameter_change_proposal()
   → Proposal created with type=ParameterChange{MinDuration, 180}
   → Voting opens

2. Token holders vote (Yes/No/Abstain)

3. After voting window closes, call finalise()
   → Proposal passes if quorum met and Yes > No

4. Wait for timelock to expire

5. Admin calls execute()
   → Proposal type is ParameterChange
   → New value (180) is applied to MinDuration
   → All future proposals must respect the new duration range
   → Proposal marked as Executed
```

Admin emergency override:

```
1. Admin calls execute_parameter_change_override(MinDuration, 180)
   → Change applied immediately (no timelock)
   → Event emitted: "paramoveride" with admin, key, value
   → Token holders see the change on-chain immediately
```

### 3.4 Semantic Validation

Each `ConfigKey` has specific validation rules:

| Key | Constraint | Rationale |
|-----|-----------|-----------|
| `MinProposalBalance` | Any `u64` (0 allowed) | Allows setting to 0 for permissionless proposals |
| `ProposalCooldown` | Any `u64` (0 allowed) | Allows disabling cooldown |
| `TimelockDuration` | Any `u64` (0 allowed) | Allows removing timelock (not recommended) |
| `MinDuration` | Must be > 0 | Prevents proposals with negative or zero duration |
| `MaxDuration` | Must be > 0 | Ensures duration range is meaningful |

Additional semantic invariants (enforced at proposal creation, not parameter change):
- `MinDuration <= MaxDuration` (checked when both are set; DAOs must coordinate)

### 3.5 Event Schema

New event: `paramoveride`  
Topics: `("paramoveride",)`  
Data: `(admin: Address, config_key: ConfigKey, new_value: u64)`

Fired when `execute_parameter_change_override()` is called.

---

## 4. Alternatives Considered

### 4.1 Alternative A: Parameter Governance DAO (Multi-Sig)

Create a separate governance contract for parameter changes, requiring M-of-N signatures from a parameter guardians set.

**Pros:**
- Decentralized (no single admin)
- Explicit oversight layer for sensitive changes

**Cons:**
- Adds operational complexity
- Requires deploying and integrating a separate contract
- Deferred to v1.0.0 (multi-sig roadmap)

**Decision:** Defer. Implement single-admin emergency override in v0.1.1; upgrade to multi-sig guardians in v1.0.0.

### 4.2 Alternative B: Conditional Proposals

Allow proposals to contain conditional logic: "If X parameter exceeds Y, then change Z to W."

**Pros:**
- Enables sophisticated governance policies
- Example: Auto-adjust cooldown based on proposal volume

**Cons:**
- Complex to validate and execute on-chain
- High gas cost
- Difficult to audit and test

**Decision:** Defer to v0.2.0 (post-launch). Start with simple atomic changes.

### 4.3 Alternative C: Time-Weighted Parameters

Allow parameters to be scheduled for change at a future block/timestamp, with a "cancel" function.

**Pros:**
- Gives stakeholders time to react or prepare
- Can be combined with timelock

**Cons:**
- Adds state management complexity
- Overlaps with the existing timelock mechanism

**Decision:** Use existing timelock. The timelock already provides the necessary delay.

---

## 5. Rationale

### 5.1 Why `u64` for Parameter Values?

All supported configuration parameters are durations, balances, or counts—all representable as `u64`. Using `u64` simplifies the contract and storage layer, and avoids a generic `Vec<u8>` encoding that would require off-chain deserialization.

If v0.2.0 introduces parameters requiring larger bit widths or complex types, we can extend `ConfigKey` with new variants.

### 5.2 Why Admin Emergency Override?

Even in decentralized governance, there are scenarios that require immediate action:
- A critical bug is discovered.
- An active exploit is underway.
- A governance griefing attack needs immediate response.

An admin override with:
1. **No timelock** (to respond quickly), and
2. **Visible events** (to maintain transparency),

provides a reasonable emergency escape hatch without concentrating power.

The override is **logged and auditable**, so:
- Off-chain monitors can alert if the admin behaves suspiciously.
- Token holders can organize a vote to revoke admin keys (requiring a separate proposal on the governance contract or token contract).
- DAOs can configure their admin to be a time-locked governance contract (best practice for production).

### 5.3 Why No Parameter Validation at Change Time?

Semantic validation (e.g., `MinDuration > 0`) is enforced **at proposal creation**, not at execution time. This ensures:
- DAOs cannot accidentally vote for an invalid configuration.
- Changes are atomic and immediately correct.
- No "pending" or "staging" state that could introduce inconsistencies.

---

## 6. Implementation Plan

### Phase 1: Atomic Parameter Changes (v0.1.1) ✅ IMPLEMENTED

- [x] Add `ProposalType` enum with `ParameterChange` variant
- [x] Add `ConfigKey` enum for supported parameters
- [x] Extend `Proposal` struct with `proposal_type` field
- [x] Implement `create_parameter_change_proposal()`
- [x] Extend `execute()` to handle parameter changes
- [x] Implement `execute_parameter_change_override()`
- [x] Add semantic validation for each config key
- [x] Add tests for all parameter change scenarios
- [x] Document in this ADR

### Phase 2: Invariant Checking (v0.2.0)

- [ ] Enforce `MinDuration <= MaxDuration` across parameter changes
- [ ] Add monitoring/alerting for parameter changes
- [ ] Publish parameter history in off-chain indexer

### Phase 3: Multi-Sig Governance (v1.0.0)

- [ ] Replace single admin with M-of-N parameter guardians
- [ ] Implement two-stage change (propose + approve)
- [ ] Add upgrade path from v0.1.x to v1.0.0

---

## 7. Security Considerations

### 7.1 Attack: Vote on Invalid Parameter

**Threat:** A proposer creates a parameter change proposal with an invalid value (e.g., `MinDuration = 0`).

**Mitigation:** Semantic validation is enforced at `create_parameter_change_proposal()`. Invalid proposals cannot be created.

**Impact:** None—attack is prevented.

### 7.2 Attack: Admin Abuse

**Threat:** Admin calls `execute_parameter_change_override()` maliciously (e.g., setting `MinProposalBalance` to `u64::MAX` to block all proposals).

**Mitigation:**
- All overrides are emitted as events and visible on-chain.
- DAOs can respond by:
  1. Revoking admin keys (via governance on a separate contract).
  2. Exiting the DAO and selling their tokens.
  3. Organizing a counter-proposal to revert the change (requires the override to not break proposals entirely).

**Impact:** Medium. Requires governance coordination to respond but is detectable and reversible.

**Recommendation:** Production DAOs should configure the admin to be a time-locked governance contract, not an EOA.

### 7.3 Attack: Frontrun Parameter Change

**Threat:** An attacker observes a parameter change proposal winning and frontrunns `execute()` to exploit the old parameters before the new ones take effect.

**Mitigation:** The timelock ensures a window between proposal passing and execution. Frontrunning is not possible within a single transaction (Soroban atomic execution prevents this).

**Impact:** None—attack is blocked by timelock and atomic execution.

---

## 8. Testing

Comprehensive test coverage:

- ✅ Creating parameter change proposals for each `ConfigKey`
- ✅ Rejecting proposals with invalid parameter values
- ✅ Executing parameter change proposals and verifying the change takes effect
- ✅ Admin using emergency override
- ✅ Non-admin blocked from using emergency override
- ✅ Parameter changes applied atomically (no partial state)
- ✅ Mixed standard and parameter change proposals in proposal list
- ✅ Parameter changes with different governance outcomes (pass/reject)

See `contracts/governance/src/test.rs` → "Issue #118" test section.

---

## 9. Upgrade Path

### From v0.1.0 to v0.1.1

Existing contracts are not affected. New contracts deployed with v0.1.1 can use parameter change proposals. Existing contracts can continue using the old proposal model (no breaking changes).

### From v0.1.1 to v0.2.0+

If introducing new `ConfigKey` variants:
1. Extend the `ConfigKey` enum.
2. Add semantic validation for the new key.
3. Update storage setters/getters as needed.
4. Add tests.
5. No state migration needed (existing proposals remain valid).

---

## 10. References

- **GitHub Issue:** #118 (Add governance parameter change proposals)
- **SC-020:** Snapshot mechanism proposal (complements this ADR with vote weight snapshotting)
- **SEC-006:** Admin key rotation (complements with two-step admin transfer)
- **Known Issues:** `docs/security/known-issues.md` § KI-002 (Admin is single point of trust)

