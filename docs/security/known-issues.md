# Known Issues

This document lists known limitations and accepted risks in VoteChain v0.1.1, prepared for external auditors. Issues listed here are acknowledged by the maintainers and do not need to be re-reported unless a new attack vector is identified.

---

## KI-001 — Vote Weight Recycling (No Snapshot Mechanism)

**Severity:** Medium  
**Component:** `contracts/governance/src/lib.rs` → `cast_vote`, `cast_vote_with_delegators`  
**Status:** Accepted — Planning SC-020 snapshot mechanism for v0.2.0  

**Description:**  
Vote weight is read from the voter's live token balance at the time `cast_vote` is called. After voting, a voter can transfer their tokens to a second address, which can then vote on the same proposal with the same tokens. This allows a single economic position to cast votes with weight exceeding its actual stake across multiple addresses (token recycling).

**Impact:**  
A coordinated group or well-funded attacker can amplify their effective vote weight by recycling tokens across multiple addresses within the same voting window. However, all transfers are visible on-chain, and the attack is rate-limited by the `has_voted` guard (one vote per unique voter address per proposal).

**Mitigation (Current v0.1.x):**  
1. **Soroban's atomic execution model** prevents same-transaction flash-loan attacks. Within a single transaction, balance updates and vote records are synchronized, preventing an attacker from acquiring tokens, voting, and repaying within the same invocation.
2. **The `has_voted` guard** prevents a single address from voting twice on the same proposal, requiring attackers to use multiple addresses (making the attack detectable).
3. **On-chain transparency:** All token transfers are visible, enabling off-chain analysis to identify suspicious voting patterns.

These mitigations reduce the risk to acceptable levels for v0.1.x but do not eliminate it.

**Mitigation (Planned SC-020):**  
Implement a balance snapshot at proposal creation time. The snapshot records each address's balance at the ledger when the proposal was created and uses that value as the vote weight, preventing post-creation token movement from affecting the tally entirely.

**Why not fixed yet:**  
Soroban does not natively support balance checkpointing. Implementing SC-020 requires either a custom snapshot function in the token contract or an off-chain indexer, both of which are non-trivial. This is planned for v0.2.0 as a best-practices enhancement.

**Investigation & Analysis:**  
See `docs/security/SEC-011-flash-loan-investigation.md` for a detailed analysis of the flash-loan attack vector, Soroban execution model mitigations, and risk assessment.

**References:** 
- `docs/security/SEC-008-token-balance-fetch-audit.md` — Token balance fetch audit
- `docs/security/SEC-011-flash-loan-investigation.md` — Flash-loan attack investigation (NEW)

---

## KI-002 — Admin Is a Single Point of Trust

**Severity:** Low  
**Component:** `contracts/governance/src/lib.rs` → `execute`, `cancel`, `update_quorum`  
**Status:** Accepted — by design for v0.1.x  

**Description:**  
A single admin address controls proposal execution, cancellation, and quorum updates. If the admin key is compromised, an attacker can cancel any active proposal or execute any passed proposal.

**Impact:**  
Governance can be disrupted or manipulated by whoever controls the admin key.

**Mitigation considered:**  
Replace the single admin with a multi-sig address or a time-locked governance contract. This is the intended upgrade path for production deployments.

**Why not fixed yet:**  
Multi-sig and time-lock primitives are external to this contract. Integrators are expected to deploy the contract with a multi-sig admin for production use.

---

## KI-003 — No Proposal Creation Fee or Rate Limit

**Severity:** Informational  
**Component:** `contracts/governance/src/lib.rs` → `create_proposal`  
**Status:** Accepted  

**Description:**  
Any address can create an unlimited number of proposals at no cost beyond the Stellar transaction fee. This could be used to spam the proposal list and increase storage costs.

**Impact:**  
Low — Stellar transaction fees provide a natural economic deterrent. Proposal storage uses persistent storage which has ledger-based rent, further limiting the practical impact.

**Mitigation considered:**  
Require a minimum token balance to create a proposal, or impose a cooldown period per address. Not implemented to keep the contract permissionless.

---

## KI-004 — `unwrap_or` Defaults in Storage Helpers

**Severity:** Informational  
**Component:** `contracts/governance/src/storage.rs`, `contracts/token/src/storage.rs`  
**Status:** Accepted — intentional  

**Description:**  
Several storage helpers use `.unwrap_or(0)` or `.unwrap_or((0, 0, 0))` to return a default value when a key is absent (e.g., `proposal_count`, `get_version`, `balance_of`). These are not panics — they return a safe default — but auditors should verify that the defaults are semantically correct in all call sites.

**Impact:**  
None identified. All call sites treat the default as the correct initial value (zero balance, zero count, version 0.0.0 before init).

---

## KI-005 — Quorum Can Be Set to 1 by Proposer

**Severity:** Low  
**Component:** `contracts/governance/src/lib.rs` → `create_proposal`  
**Status:** Accepted  

**Description:**  
The `quorum` parameter is caller-supplied with no minimum enforced beyond `> 0`. A proposer can set `quorum = 1`, meaning a single token unit is sufficient for the proposal to pass.

**Impact:**  
A proposer with any token balance can create a self-passing proposal. The admin can raise the quorum via `update_quorum`, but this requires active monitoring.

**Mitigation considered:**  
Enforce a minimum quorum at the contract level (e.g., a percentage of total supply). Not implemented to keep the contract flexible for different deployment contexts.
