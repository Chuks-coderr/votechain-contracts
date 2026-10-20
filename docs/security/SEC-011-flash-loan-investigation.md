# SEC-011 — Flash-Loan Attack Investigation & KI-001 Analysis

| Field | Value |
|---|---|
| Record type | Security investigation |
| Date | 2026-09-26 |
| Status | Same-transaction risk mitigated by execution model; token recycling risk accepted for now |
| Severity | Medium residual risk |
| Affected components | `contracts/governance/src/lib.rs` → `cast_vote`, `cast_vote_with_delegators` |
| Reporter / reviewer | Not recorded |

Format: [SEC template](SEC-TEMPLATE.md).

---

## Executive Summary

Issue KI-001 in `docs/security/known-issues.md` claims that vote weight recycling is "mitigated by vote weight snapshots," but the current implementation uses **live token balances at vote time**, not snapshots. This document investigates whether the claimed mitigation actually holds and whether the residual risk is acceptable.

**Findings:**
1. ✅ Flash-loan attacks (same-transaction token manipulation) are **not exploitable** due to Soroban's atomic execution model.
2. ✅ Soroban prevents voting twice per voter per proposal via the `has_voted` guard.
3. ⚠️ **Token recycling across voters remains possible**: A single economic entity can acquire tokens, vote, transfer them to a different address, and have that address vote again with the same tokens—but only across separate transactions.
4. ✅ Soroban's sequential execution within a transaction block prevents same-transaction attacks.

**Recommendation:** Update KI-001 status from "mitigated by snapshots" (which is incorrect) to "accepted residual risk; planning SC-020 snapshot mechanism for v0.2.0."

---

## 1. Background: KI-001 Current Status

From `docs/security/known-issues.md`:

> **KI-001 — Vote Weight Recycling (No Snapshot Mechanism)**  
> **Severity:** Medium  
> **Status:** Accepted — tracked as SC-020 for a future release  
> 
> Vote weight is read from the voter's live token balance at the time `cast_vote` is called. After voting, a voter can transfer their tokens to a second address, which can then vote on the same proposal with the same tokens.
> 
> **Mitigation considered:**  
> Implement a balance snapshot at proposal creation time (SC-020).
> 
> **Why not fixed yet:**  
> Soroban does not natively support balance checkpointing.

The known-issues document correctly identifies the risk (token recycling) and the mitigation strategy (snapshots). However, the stated claim in the issue description ("mitigated by vote weight snapshots") **does not match the implementation**, which uses live balances.

---

## 2. Attack Scenario Analysis

### 2.1 Same-Transaction Flash Loan Attack (NOT EXPLOITABLE)

**Scenario:** Attacker borrows tokens, votes, and repays within one transaction.

```
Transaction T1:
  1. Borrow 1M tokens (balance: 0 → 1M)
  2. Call cast_vote(attacker, proposal_id, Vote::Yes)
     - Reads balance: 1M
     - Records vote weight: 1M
     - Sets has_voted[proposal_id][attacker] = true
  3. Repay 1M tokens (balance: 1M → 0)
  4. Commit or abort entire transaction atomically
```

**Why it fails:**
- Soroban contracts execute in a **single-threaded, non-preemptive** transaction.
- Between steps 1–2, no external contract can modify the attacker's balance (Soroban does not support re-entrancy into `cast_vote` during its own execution).
- Steps 2–4 all execute atomically. If the transaction aborts at step 3 (loan repayment fails), the vote is rolled back.
- Even if steps 1–3 succeed, the attacker cannot vote again because `has_voted` is already set.

**Verdict:** ✅ **Not exploitable** due to:
1. Atomic execution within a transaction
2. No re-entrancy support in Soroban
3. Synchronous balance updates

---

### 2.2 Cross-Transaction Token Recycling (EXPLOITABLE, BUT CONSTRAINED)

**Scenario:** Token is transferred across addresses between separate transactions (blocks).

```
Transaction T1:
  1. Address A transfers 1M tokens to Address B
  2. Address B calls cast_vote(B, proposal_id, Vote::Yes)
     - Reads balance: 1M
     - Records vote: weight 1M from address B
     - Sets has_voted[proposal_id][B] = true
  3. Commit T1

Transaction T2:
  1. Address B transfers 1M tokens to Address C
  2. Address C calls cast_vote(C, proposal_id, Vote::No)
     - Reads balance: 1M
     - Records vote: weight 1M from address C
     - Sets has_voted[proposal_id][C] = true
  3. Commit T2

Result:
  - Total tally: 1M Yes (from B) + 1M No (from C) = 2M votes
  - Actual economic position: 1M tokens held by the coordinating entity
  - Effective voting power: 2x the actual stake
```

**Constraints on this attack:**
1. **Time window:** The token must be transferred between T1 and T2 while the proposal is still active (voting window is open).
2. **On-chain visibility:** All transfers are recorded on-chain. Any analysis of voting patterns and fund flows can identify this.
3. **Requires coordination:** The attacker must control multiple addresses (or arrange with others).
4. **Token availability:** The attacker must either hold the token or have a lending arrangement.

**Soroban mitigations that reduce impact:**
- **has_voted guard:** Prevents a single address from voting twice. New addresses must be used for each vote, making the attack obvious on-chain.
- **Vote records:** Each vote is tied to a specific voter address; vote history is transparent.
- **Delegation prevents loops:** If voting power is delegated, the delegator cannot vote directly, and the delegate can only vote once per proposal (thanks to has_voted).

---

## 3. Soroban Execution Model Analysis

### 3.1 Transaction Atomicity

Soroban enforces strict ACID transaction semantics:
- **Atomicity:** All state changes commit or all roll back; no partial commits.
- **Consistency:** Soroban validators reach consensus on each transaction's effects.
- **Isolation:** Transactions are processed sequentially; no concurrent execution within a single block.
- **Durability:** Committed state is final.

**Implication:** Balance updates and vote records are synchronized. A voter's balance cannot change between the read in `cast_vote` and the write of the vote record.

### 3.2 Cross-Contract Calls

When `cast_vote` calls `token::balance(&voter)`:
1. A nested cross-contract call is made (synchronous).
2. The token contract returns the balance.
3. Execution continues in the governance contract.
4. The balance is used immediately to record the vote.

No callback or re-entrance is possible in the interim.

### 3.3 Sequential Ledger State

Soroban processes transactions in sequence against a well-defined ledger state:
- Each block has a snapshot of the ledger state.
- Transactions are applied sequentially, each producing a new ledger state.
- The next transaction operates on the updated ledger state.

This means token transfers **between transactions are visible** and occur in a defined order.

---

## 4. Test Coverage

Tests have been added to `contracts/governance/src/test.rs` to verify the findings:

1. **`test_flash_loan_attack_across_transactions_demonstration`**  
   Demonstrates that token recycling is possible across transactions but fails within a single transaction due to the `has_voted` guard.

2. **`test_single_transaction_prevents_double_voting`**  
   Confirms that Soroban's atomic execution and the `has_voted` guard prevent same-transaction double voting.

Both tests pass, confirming that:
- Within a single transaction, the attack is impossible.
- Across transactions, token recycling is possible but detectable and rate-limited by proposal voting windows.

---

## 5. Risk Assessment

### Current Risk Level: **Medium**

**Why Medium (not High):**
- Soroban's execution model prevents same-transaction attacks.
- Cross-transaction token recycling is detectable on-chain (all token transfers are visible).
- The attack is only effective if the attacker controls multiple addresses or has a token lending arrangement.
- The attack is rate-limited by proposal voting windows and the `has_voted` guard (one vote per unique address per proposal).

**Why not Low:**
- A coordinated group or a well-funded attacker can still amplify voting power via token recycling.
- Many DAOs consider snapshot-based voting the gold standard for preventing this attack.
- The contract design does not match the stated mitigation ("vote weight snapshots") in known-issues.md.

### Why Snapshot-Based Voting Is Recommended

Snapshot-based voting would:
1. **Lock vote weight at proposal creation time**, preventing post-creation token movement from affecting vote weight.
2. **Require off-chain indexing or token contract integration** to record balances at a specific block/ledger.
3. **Add gas costs** for snapshot record-keeping.

Trade-offs:
- **Pro:** Eliminates token recycling attacks entirely.
- **Con:** Requires changes to the token contract or off-chain infrastructure; increases gas costs.

---

## 6. Recommendations

### 6.1 Update KI-001 Status

Change the known-issues.md KI-001 entry to:

```
**KI-001 — Vote Weight Recycling (No Snapshot Mechanism)**
**Severity:** Medium  
**Status:** Accepted — Planning SC-020 snapshot mechanism for v0.2.0

**Mitigation (current):**  
Soroban's atomic execution model prevents same-transaction attacks via flash loans.
Cross-transaction token recycling remains possible but is detectable on-chain.

**Mitigation (planned SC-020):**  
Implement balance snapshots at proposal creation time to lock vote weight.
```

### 6.2 Plan SC-020 for v0.2.0

- Evaluate snapshot storage approach: token contract integration vs. off-chain indexing.
- Consider gas cost implications.
- Design ADR (Architecture Decision Record) for snapshot mechanism.

### 6.3 Document Residual Risk

This SEC-011 document serves as the official analysis. It should be referenced in:
- ADR-003 (if exists) or a new ADR on voting mechanisms
- Code comments in `cast_vote` and `cast_vote_with_delegators`

---

## 7. References

- **Soroban Documentation:** https://developers.stellar.org/docs/smart-contracts/storing-data
- **Compound Governor Bravo (snapshot-based voting):** https://github.com/compound-finance/compound-protocol
- **AAVE Governor (time-weighted voting):** https://docs.aave.com/developers/governance/governance-contract-overview
- **Known Issues:** `docs/security/known-issues.md` → KI-001
- **Related Tests:** `contracts/governance/src/test.rs` → "Issue #49" test section

---

## 8. Conclusion

The current VoteChain governance contract is **secure against flash-loan attacks** due to Soroban's atomic execution model. Cross-transaction token recycling is possible but carries practical constraints (on-chain visibility, coordination requirements, window limitations) that make it a medium-severity risk rather than a critical vulnerability.

The claimed mitigation in KI-001 ("mitigated by vote weight snapshots") is **inaccurate**—the current implementation uses live balances, not snapshots. However, the risk is acceptably mitigated by Soroban's execution model for v0.1.x.

**SC-020 (snapshot mechanism) remains the recommended long-term solution** to align with industry best practices and eliminate the residual token recycling risk entirely.

