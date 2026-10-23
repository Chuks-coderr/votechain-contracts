# SEC-010: Reentrancy Analysis — cross-contract call in `cast_vote`

| Field | Value |
|---|---|
| Record type | Security analysis |
| Date | 2026-04-28 |
| Status | Closed; no exploitable reentrancy path found |
| Severity | Informational; no vulnerability confirmed |
| Affected components | `contracts/governance/src/lib.rs` — `GovernanceContract::cast_vote` |
| Reporter / reviewer | Not recorded |

Related issue: #88 (SEC-003). Format: [SEC template](SEC-TEMPLATE.md).

---

## 1. Background

`cast_vote` makes a cross-contract call to the governance token contract to
fetch the voter's token balance (voting weight).  Cross-contract calls are a
classic reentrancy surface: if state is written *after* the external call, a
malicious callee could re-enter the caller and observe or manipulate
intermediate state.

---

## 2. Call sequence in `cast_vote`

```
cast_vote(voter, proposal_id, vote)
  1. voter.require_auth()
  2. load_proposal()                        ← read state
  3. check proposal.state == Active
  4. check timestamp bounds
  5. has_voted() check                      ← read state (dedup guard)
  6. token_client.balance(&voter)           ← CROSS-CONTRACT CALL (read-only)
     └─ save_voter_snapshot()               ← write snapshot immediately after
  7. weight > 0 check
  8. update proposal vote tallies           ← write state
  9. mark_voted()                           ← write dedup flag
 10. save_vote_record()                     ← write audit record
 11. save_proposal()                        ← write updated proposal
 12. events::vote_cast()                    ← emit event
```

---

## 3. Reentrancy analysis

### 3.1 Is the dedup flag written before or after the cross-contract call?

The `has_voted` check (step 5) happens **before** the cross-contract call
(step 6).  However, `mark_voted` (step 9) is written **after** the call.

This ordering means that if the token contract could re-enter `cast_vote`
during step 6, the `has_voted` guard at step 5 would not yet be set, and a
second vote could theoretically be cast.

### 3.2 Can the token contract re-enter `cast_vote`?

**No.** The Soroban host enforces a strict call-depth limit and, critically,
**does not allow a callee to call back into the caller's contract within the
same transaction**.  The Soroban execution model is single-threaded and
synchronous; there is no callback mechanism that would let the token contract
invoke `cast_vote` again during the `balance()` call.

Additionally, the token contract in this repository (`contracts/token`) is a
simple ERC-20-style contract with no hooks, callbacks, or re-entrant paths.
Its `balance()` function is a pure storage read.

### 3.3 Snapshot write ordering

After the cross-contract call returns, `save_voter_snapshot` is called
immediately (still within step 6's `None` branch).  All subsequent state
writes (steps 8–11) use the locally captured `weight` value — they do not
re-query the token contract.  This means even if the voter's balance changed
between the snapshot and the tally update, the recorded weight is fixed.

### 3.4 Double-vote path

The only path that could allow double-voting would require:

1. `has_voted` returns `false` for the voter, AND
2. `cast_vote` is entered a second time before `mark_voted` is written.

Condition 2 is impossible under Soroban's execution model (see §3.2).
Therefore no double-vote via reentrancy is possible.

---

## 4. Verdict

| Risk | Finding |
|------|---------|
| Reentrancy via token `balance()` call | **Not exploitable** — Soroban prohibits cross-contract re-entry within a single transaction |
| Double-vote via reentrancy | **Not possible** — execution model prevents re-entry before `mark_voted` is written |
| Balance manipulation after snapshot | **Mitigated** — snapshot is captured once and reused; no second token query occurs |

**Overall: No reentrancy vulnerability exists in `cast_vote`.**

---

## 5. Recommendations

Although no vulnerability exists today, the following hardening measures are
recommended for defence-in-depth:

1. **Move `mark_voted` before the cross-contract call.**  Writing the dedup
   flag before calling `token_client.balance()` would make the protection
   explicit and independent of the Soroban execution model guarantee.  This is
   the standard checks-effects-interactions pattern.

2. **Document the ordering invariant** in the `cast_vote` source with an
   inline comment explaining why the cross-contract call is safe.

3. **If the token contract is ever replaced** with one that has hooks or
   callbacks, re-run this analysis.  The current safety guarantee is partly
   contingent on the token contract being a simple read-only balance query.

---

## 6. References

- Soroban execution model: https://developers.stellar.org/docs/smart-contracts/
- Checks-Effects-Interactions pattern: https://docs.soliditylang.org/en/latest/security-considerations.html#re-entrancy
- `contracts/governance/src/lib.rs` — `cast_vote` function
- `contracts/token/src/lib.rs` — `balance` function
