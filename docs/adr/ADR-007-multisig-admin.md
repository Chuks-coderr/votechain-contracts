# ADR-007: Multi-Signature Admin Support

**Status:** Proposed
**Date:** 2026-09-24
**Issue:** [#57](https://github.com/veracindarella/votechain-contracts/issues/57)

---

## Context

The current governance contract uses a **single admin address** for all privileged operations (execute, cancel, pause, update quorum, transfer admin). A compromised admin key can irreversibly cancel proposals or execute malicious governance actions with no recourse.

Multi-signature (M-of-N) admin support means that N admin addresses are registered at initialization, and at least M of them must co-sign any privileged operation before it executes.

This is especially important for:
- **High-value DAOs** where a single compromise is catastrophic.
- **Regulatory requirements** requiring multi-party authorisation for treasury actions.
- **Key-rotation resilience** — a stolen key alone cannot act.

---

## Decision

Add an optional multi-sig admin path alongside the existing single-admin path. Both paths must coexist so that existing single-admin deployments are unaffected.

### New entry point: `initialize_multisig`

```rust
pub fn initialize_multisig(
    env: Env,
    admins: Vec<Address>,   // N co-signers
    threshold: u32,         // M — how many must co-sign
    voting_token: Address,
    min_proposal_balance: i128,
    proposal_cooldown: u64,
    min_duration: u64,
    max_duration: u64,
    restrict_admin_vote: bool,
    timelock_duration: u64,
) -> Result<(), ContractError>
```

All N admins must `require_auth()` on this call to prevent a rogue party from registering themselves as a co-signer.

### Pending action queue

Because Soroban transactions are atomic and there is no native multi-sig in the execution model, multi-sig is implemented as a **two-phase commit**:

1. **Propose action** — any co-signer calls `propose_multisig_action(env, signer, action)` to register a pending action. The action is hashed and stored in temporary storage.
2. **Approve action** — each remaining co-signer calls `approve_multisig_action(env, signer, action_id)` to add their signature.
3. **Execute action** — once the approval count reaches `threshold`, any co-signer can call `execute_multisig_action(env, signer, action_id)` to run the action.

Pending actions expire after a configurable TTL (default: 7 days) to prevent stale actions from being executed after circumstances change.

### Actions covered by multi-sig

| Action | Description |
|--------|-------------|
| `AdminExecute(proposal_id)` | Mark a passed proposal as executed |
| `AdminCancel(proposal_id)` | Cancel an active proposal |
| `AdminPause` | Pause the contract |
| `AdminUnpause` | Unpause the contract |
| `AdminUpdateQuorum(proposal_id, new_quorum)` | Update quorum on an active proposal |
| `AdminTransfer(new_admin)` | Replace the entire co-signer set |

### Storage

| Key | Tier | Description |
|-----|------|-------------|
| `MultisigAdmins` | Instance | `Vec<Address>` of N co-signers |
| `MultisigThreshold` | Instance | M — required approval count |
| `PendingAction(action_id)` | Temporary | Pending multi-sig action + approvals |

Temporary storage is used for pending actions so they expire naturally with the ledger entry TTL; no manual cleanup is required.

### Backwards compatibility

- Existing `initialize(...)` remains unchanged.
- Single-admin operations (execute, cancel, etc.) remain unchanged when the contract was initialised with `initialize`.
- When initialised with `initialize_multisig`, single-admin functions return `ContractError::MultisigRequired` instead of executing directly.

---

## Alternatives Considered

### A. Native Stellar multi-sig on the admin account
Use Stellar's built-in account signers and threshold on a hot wallet.

**Rejected** because it moves security outside the contract; the contract cannot verify that the on-chain threshold was actually met, and it ties governance security to the Stellar account model rather than to the contract itself.

### B. Timelock-only (no multi-sig)
Add a delay before admin actions take effect, giving stakeholders time to react.

**Rejected** as insufficient alone — a compromised key can still queue a malicious action.

---

## Consequences

### Positive
- Compromised single key cannot execute admin actions unilaterally.
- Aligns with best-practice DAO security (Gnosis Safe model).
- Temporary storage for pending actions means no manual cleanup.

### Negative
- Increased call complexity — admin operations now require multiple transactions.
- Temporary storage TTL means slow-moving organisations must re-propose actions before they expire.
- Audit surface increases.

### Neutral
- Single-admin path is unaffected. Existing deployments need no migration.

---

## Implementation Notes

- Pending action IDs are derived by hashing `(action_type, payload, proposer, timestamp)` to ensure uniqueness.
- The threshold must satisfy `1 <= threshold <= len(admins)` at initialization.
- `Vec<Address>` must have `1 <= len <= 10` (practical limit for Soroban storage efficiency).
- All co-signers must `require_auth()` when proposing/approving to prevent replay attacks.
