# Audit Scope

**Project:** VoteChain Contracts  
**Version:** 0.1.1  
**Audit type:** External security audit  
**Date prepared:** 2026-04-25  

---

## In-Scope Files

### Governance contract

| File | Description |
|------|-------------|
| `contracts/governance/src/lib.rs` | All public entry points: `initialize`, `create_proposal`, `cast_vote`, `finalise`, `execute`, `cancel`, `update_quorum`, `get_proposal`, `has_voted`, `proposal_count`, `get_version` |
| `contracts/governance/src/storage.rs` | Storage read/write helpers for proposals, admin, token, vote records, version |
| `contracts/governance/src/types.rs` | `ContractError`, `ProposalStatus`, `Vote`, `Proposal`, `DataKey` |
| `contracts/governance/src/events.rs` | On-chain event emission |

### Token contract

| File | Description |
|------|-------------|
| `contracts/token/src/lib.rs` | `initialize`, `balance`, `transfer`, `approve`, `transfer_from`, `mint`, `burn`, `total_supply`, `get_version` |
| `contracts/token/src/storage.rs` | Balance, allowance, total supply, admin, version storage helpers |
| `contracts/token/src/types.rs` | `ContractError`, `TokenDataKey` |

### Build and CI

| File | Description |
|------|-------------|
| `Cargo.toml` | Workspace dependency pinning |
| `contracts/governance/Cargo.toml` | Governance crate dependencies |
| `contracts/token/Cargo.toml` | Token crate dependencies |
| `.github/workflows/ci.yml` | Build, test, and lint pipeline |
| `.github/workflows/audit.yml` | Automated `cargo audit` dependency scan |

### Indexer & API

| File | Description |
|------|-------------|
| `indexer/src/main.rs` | PostgreSQL-backed event indexer: Horizon polling loop, sqlx queries (`last_ledger`, `save_cursor`, `insert_event`, `list_events`, `list_proposal_events`), and REST API endpoints |
| `api/src/lib.rs` | In-memory indexer library consumed by the backend REST server — **contains no SQL queries** |

**Approved tools — SQL access layer:**

| Tool | Justification |
|------|---------------|
| `sqlx` | All SQL queries use parameterised placeholders (`$1`, `$2`, …) bound via `.bind()`. No dynamic query string construction is permitted. Verified by SEC-013. `cargo audit` and `cargo deny` run in CI to detect known-vulnerable sqlx releases. |

---

## Out-of-Scope

- `contracts/governance/src/test.rs` and `test_helpers.rs` — test code only
- `contracts/governance/src/prop_tests.rs` — property tests only
- `contracts/token/src/test.rs` — test code only
- `scripts/` — deployment scripts (shell, not contract logic)
- `docs/` — documentation only
- `config/` — environment configuration
- Third-party crates (`soroban-sdk`, `stellar-xdr`, etc.)

---

## Key Areas of Focus

1. **Access control** — verify `require_auth` is called on all state-mutating functions with the correct signer, and that admin-only functions correctly reject non-admin callers.

2. **Vote integrity** — verify the double-vote guard (`has_voted` / `mark_voted`) cannot be bypassed, and that vote weight is correctly read from the token contract.

3. **Arithmetic safety** — verify `checked_add` in `cast_vote` correctly handles overflow and that no other arithmetic can overflow or underflow.

4. **Proposal lifecycle** — verify that state transitions are exhaustive and that terminal states (Passed, Rejected, Executed, Cancelled) cannot be re-entered.

5. **Initialisation guard** — verify `is_initialized` prevents re-initialisation and that the guard fires before any auth check.

6. **Storage key collisions** — verify `DataKey` and `TokenDataKey` variants cannot collide across proposals or voters.

7. **Cross-contract trust** — verify the governance contract's reliance on the token contract's `balance` return value and assess the impact of a malicious or buggy token contract.

8. **Event correctness** — verify emitted events accurately reflect state transitions and cannot be spoofed.

---

## Commit Reference

Auditors should check out the tagged release:

```bash
git checkout v0.1.1
```

All findings should reference file paths and line numbers relative to this tag.

---

## Environment

| Component | Version |
|-----------|---------|
| Rust | 1.85+ (stable) |
| Soroban SDK | 22.0.0 |
| Target | `wasm32-unknown-unknown` |
| Stellar Protocol | 22 |

---

## Contacts

| Role | Contact |
|------|---------|
| Lead maintainer | security@votechain.dev |
| Security disclosures | See [SECURITY.md](../../SECURITY.md) |

---

## Formal Audit Engagement (SEC-001)

**Status:** Completed  
**Audit firm:** OtterSec  
**Engagement period:** 2026-05-01 – 2026-05-20  
**Report published:** 2026-05-27  
**Report location:** [AUDIT.md](../../AUDIT.md#sec-001-formal-audit-report)

### Engagement Summary

OtterSec was engaged to perform a full manual security review of the governance and token contracts at tag `v0.1.1`. The audit covered all in-scope files listed above with particular focus on the eight key areas of focus.

### Findings Summary

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| OTT-001 | High | Vote weight recycling via token transfer | Remediated (SEC-020) |
| OTT-002 | Medium | Quorum can be set to 1 by any proposer | Accepted (KI-005) |
| OTT-003 | Low | Single admin is a single point of trust | Accepted (KI-002) |
| OTT-004 | Informational | `unwrap_or` defaults in storage helpers | Accepted (KI-004) |

All critical and high severity findings were remediated prior to mainnet deployment. See [AUDIT.md](../../AUDIT.md#sec-001-formal-audit-report) for the full report.
