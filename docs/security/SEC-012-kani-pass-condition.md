# SEC-012 — Formal Verification of Pass Condition Logic

| Field | Value |
|---|---|
| Record type | Formal verification |
| Date | 2026-09-28 |
| Status | Verified; Kani harnesses green |
| Severity | Not applicable; no finding reported |
| Affected components | `contracts/governance/src/kani_proofs.rs` |
| Reporter / reviewer | Not recorded |

Related issue: [#60](https://github.com/veracindarella/votechain-contracts/issues/60). Format: [SEC template](SEC-TEMPLATE.md).

---

## Background

The pass condition in `GovernanceContract::finalise` is the single most critical
logical invariant in the governance contract:

```text
total = votes_yes + votes_no + votes_abstain

Passed   if total >= quorum  AND  votes_yes > votes_no
Rejected otherwise
```

A bug here could allow a proposal to pass when it should not (governance
capture) or block a legitimate proposal (governance deadlock). Unit tests
demonstrate the condition for specific inputs; formal verification proves it
holds for **all** possible `i128` inputs.

---

## Approach

We use [Kani](https://model-checking.github.io/kani/), a bit-precise model
checker for Rust. Kani performs bounded model checking: it unrolls loops to a
fixed depth and uses a SAT/SMT solver to exhaustively verify assertions over
symbolic inputs.

The `finalise_pass_condition` function in `kani_proofs.rs` is a pure extraction
of the exact expression used in `lib.rs`; any divergence between the two would
be a bug in the harness, not a proof of the contract.

---

## Harnesses

### 1 — `verify_pass_condition_all_combinations`

Proves correctness across all four outcome combinations:

| Quorum met | Yes > No | Expected |
|------------|----------|----------|
| ✅          | ✅        | Passed   |
| ✅          | ❌        | Rejected |
| ❌          | ✅        | Rejected |
| ❌          | ❌        | Rejected |

**Inputs:** All `i128` values where each component ≤ `i128::MAX / 3` and `quorum > 0`.

### 2 — `verify_no_overflow_in_tally`

Proves that `votes_yes + votes_no + votes_abstain` does not overflow when each
component is bounded by `i128::MAX / 3` — the same bound enforced by the
`checked_add` calls in `cast_vote`.

### 3 — `verify_boundary_total_equals_quorum`

Proves the exact-boundary case: when `total == quorum` the outcome depends
solely on `votes_yes > votes_no`. No off-by-one errors are possible.

### 4 — `verify_tie_always_rejects`

Proves that `votes_yes == votes_no` (a tie) always produces `Rejected`,
regardless of quorum or any other input.

---

## Running

```bash
# Via Makefile (auto-installs cargo-kani if needed, 60 s timeout per harness)
make verify

# Directly (requires cargo-kani installed)
cargo kani --harness verify_pass_condition_all_combinations -p votechain-governance
cargo kani --harness verify_no_overflow_in_tally -p votechain-governance
cargo kani --harness verify_boundary_total_equals_quorum -p votechain-governance
cargo kani --harness verify_tie_always_rejects -p votechain-governance
```

---

## CI Integration

The `make verify` target is intended to run in CI. Each harness is bounded to
60 seconds via `timeout`. Harness failures cause a non-zero exit code, blocking
merge. The workflow step is:

```yaml
- name: Formal verification (Kani)
  run: make verify
  timeout-minutes: 5
```

Add this step to `.github/workflows/ci.yml` after the `make test` step.

---

## Residual Risk

- Kani proofs cover the pure arithmetic of the pass condition. They do not
  cover storage reads, event emission, or cross-contract calls, which are
  outside the scope of the arithmetic invariant.
- The `#[kani::unwind(2)]` bound is sufficient for non-iterative proofs but
  would need to be increased for loop-containing code.
- If the expression in `lib.rs` is refactored and `kani_proofs.rs` is not
  updated, the harness silently proves the old logic. Code review must ensure
  they stay in sync.
