# SEC-008 — Token Balance Fetch Security Audit

| Field | Value |
|---|---|
| Record type | Security audit |
| Date | 2026-04-23 |
| Status | Complete; one medium-priority recommendation remains |
| Severity | Informational overall; see individual findings |
| Affected components | `contracts/governance/src/lib.rs` → `cast_vote` |
| Reporter / reviewer | Not recorded |

Format: [SEC template](SEC-TEMPLATE.md).

---

## 1. Code Under Review

```rust
// cast_vote (lib.rs)
let token_client = token::Client::new(&env, &get_voting_token(&env));
let weight = token_client.balance(&voter);
assert!(weight > 0, "no voting power");

match vote {
    Vote::Yes     => proposal.votes_yes     = proposal.votes_yes.checked_add(weight).expect("vote tally overflow"),
    Vote::No      => proposal.votes_no      = proposal.votes_no.checked_add(weight).expect("vote tally overflow"),
    Vote::Abstain => proposal.votes_abstain = proposal.votes_abstain.checked_add(weight).expect("vote tally overflow"),
}
mark_voted(&env, proposal_id, &voter);
save_proposal(&env, &proposal);
```

---

## 2. Atomicity Analysis

**Finding: Balance fetch and tally write are atomic within the same invocation.**

Soroban contract invocations execute as a single atomic transaction on Stellar. There is no preemption, no async execution, and no re-entrancy between the `balance()` call and the subsequent `save_proposal()` write. The sequence is:

1. `token_client.balance(&voter)` — cross-contract call, returns `weight`
2. Tally updated in memory
3. `mark_voted` + `save_proposal` — both writes committed atomically with the transaction

If the transaction fails at any point after step 1, all state changes (including the tally update) are rolled back. There is no window in which `weight` is read but the tally is not yet written.

**Verdict:** ✅ No TOCTOU (time-of-check/time-of-use) vulnerability.

---

## 3. Flash Loan Attack Analysis

**Finding: Flash loan attacks are not applicable to this contract.**

A flash loan attack requires:
1. Borrowing tokens to inflate a balance
2. Using the inflated balance in a target contract
3. Repaying the loan — all within one transaction

For this to work against `cast_vote`, an attacker would need to:
- Borrow tokens, increasing their balance in the token contract
- Call `cast_vote` (which reads their balance)
- Repay the loan in the same transaction

**Why this does not apply here:**

- The Soroban execution model does not support arbitrary re-entrancy or callback chains that would allow a loan-and-repay pattern within a single `cast_vote` invocation.
- The token contract (`votechain-token`) has no flash loan primitive. There is no function that lends tokens and expects repayment within the same call.
- Even if a voter temporarily held a large balance (e.g., via a prior transfer), `mark_voted` prevents them from voting again once the balance is reduced and re-inflated.
- The double-vote guard (`has_voted`) is set before `save_proposal`, so a re-entrant call to `cast_vote` for the same voter would be rejected.

**Verdict:** ✅ Flash loan attack vector is not exploitable with the current token contract and Soroban execution model.

---

## 4. Balance Manipulation Between Fetch and Write

**Finding: No manipulation window exists within a single invocation.**

Because Soroban is single-threaded and non-preemptive within a transaction, no other contract or account can modify the voter's token balance between the `balance()` call and the `save_proposal()` write. The entire `cast_vote` function executes atomically.

A voter *could* transfer tokens to another address before calling `cast_vote` to reduce their own weight, or accumulate tokens before voting to increase it — but this is expected and intentional behaviour (token-weighted voting). It is not a manipulation vector; it is the design.

**Verdict:** ✅ No manipulation window within a single invocation.

---

## 5. Snapshot Mechanism Recommendation (SC-020)

**Risk level: Medium (governance manipulation via token movement)**

While no flash loan or TOCTOU attack is possible, a voter can still strategically time their vote:

- Accumulate tokens before voting, then transfer them to another address after voting.
- The second address can then vote with the same tokens on the same proposal.
- This allows a single economic position to cast votes with weight exceeding its actual stake.

**Recommendation:** Implement a balance snapshot mechanism (referenced as SC-020) that records each voter's token balance at the block/ledger when the proposal was created, and uses that snapshot as the vote weight rather than the live balance at vote time.

This would prevent token recycling across voters within the same proposal's voting window.

**Priority:** Medium — the current design is consistent with many on-chain governance systems (e.g., Compound Governor Bravo without checkpointing), but snapshot-based voting is the industry best practice for preventing vote weight recycling.

---

## 6. Summary of Findings

| # | Finding | Severity | Status |
|---|---|---|---|
| F-1 | Balance fetch and tally write are atomic | Informational | ✅ No action needed |
| F-2 | Flash loan attack not applicable | Informational | ✅ No action needed |
| F-3 | No TOCTOU window within invocation | Informational | ✅ No action needed |
| F-4 | Token recycling across voters possible | Medium | ⚠️ Recommend SC-020 snapshot mechanism |

---

## 7. References

- [SC-020] Snapshot mechanism proposal (future work)
- Soroban transaction atomicity: https://developers.stellar.org/docs/smart-contracts
- Compound Governor Bravo checkpointing: https://github.com/compound-finance/compound-protocol
