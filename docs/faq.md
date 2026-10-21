# Frequently Asked Questions

## General

**Q: What is VoteChain?**  
A: VoteChain is a decentralized on-chain governance protocol built with Soroban smart contracts on the Stellar blockchain. It lets DAOs, protocols, and communities create proposals, cast token-weighted votes, enforce quorum, and execute decisions — all transparently and immutably on-chain.

**Q: What blockchain does VoteChain run on?**  
A: VoteChain runs on Stellar using the Soroban smart contract platform (SDK v22.0.0).

**Q: What is Soroban and why does VoteChain use it?**  
A: Soroban is Stellar's native smart contract environment. It provides the execution layer for complex logic like weighted voting, automated tallying, and state archival — capabilities not available with traditional Stellar operations.

**Q: Is VoteChain permissionless?**  
A: Proposal creation is open to any address. Voting requires holding governance tokens. Admin-only actions (execute, cancel, initialize) are restricted to the configured admin address.

---

## Proposal Creation

**Q: Who can create a proposal?**  
A: Any address can call `create_proposal`. There is no minimum token balance required to submit a proposal.

**Q: What information is required to create a proposal?**  
A: A proposal requires a title, description, quorum threshold (minimum total votes needed to pass), and a voting duration (measured in ledgers).

**Q: How long can a voting period last?**  
A: The duration is set by the proposer at creation time as a ledger count. There is no protocol-enforced maximum — it is up to the proposer and community convention.

**Q: Can a proposal be cancelled after creation?**  
A: Yes. The admin can cancel any Active proposal by calling `cancel(admin, proposal_id)`. Cancelled proposals cannot be reactivated.

---

## Voting Mechanics

**Q: What vote options are available?**  
A: Voters can choose one of three options: Yes, No, or Abstain.

**Q: How is vote weight determined?**  
A: Vote weight equals the voter's live governance token balance at the time they cast their vote. There are no snapshots — the balance is read directly from the token contract when `cast_vote` is called.

**Q: Can I change my vote after submitting?**  
A: No. Each address can vote exactly once per proposal. Attempting to vote again returns error `102 AlreadyVoted`.

**Q: Do Abstain votes count toward quorum?**  
A: Yes. Abstain votes contribute to `total_votes` and therefore count toward meeting the quorum threshold, but they do not count as Yes or No for the majority check.

---

## Token Requirements

**Q: Which token is used for voting?**  
A: The governance token is set during contract initialization via `initialize(admin, voting_token)`. It must be a Soroban-compatible token contract deployed on Stellar.

**Q: What balance do I need to vote?**  
A: Any non-zero balance of the governance token allows you to vote. Your vote weight is proportional to your balance — a larger balance carries more weight.

**Q: What happens if I transfer tokens after voting?**  
A: Your vote is already recorded and cannot be changed. Token transfers after voting have no effect on the current proposal, but will affect your weight in future proposals.

---

## Quorum & Finalisation

**Q: How does quorum work?**  
A: Each proposal has a `quorum` value set at creation. For a proposal to pass, two conditions must both be true:
```
total_votes >= quorum  AND  votes_yes > votes_no
```
If quorum is not reached, the proposal is Rejected regardless of the Yes/No split.

**Q: Who finalises a proposal?**  
A: Anyone can call `finalise(proposal_id)` after the voting period ends. The contract evaluates the pass conditions and transitions the proposal to Passed or Rejected.

**Q: What happens after a proposal passes?**  
A: A Passed proposal must be explicitly executed by the admin via `execute(admin, proposal_id)`, which transitions it to the Executed state. Execution is a manual step — VoteChain does not automatically trigger cross-contract calls.

**Q: Can I query the current state of a proposal?**  
A: Yes. Call `get_proposal(proposal_id)` to read the full proposal state, or `has_voted(proposal_id, voter)` to check whether a specific address has already voted.

---

## Errors

**Q: What do the contract error codes mean?**

| Code | Name | Cause |
|------|------|-------|
| 101 | Unauthorized | Caller is not the admin or required signer |
| 102 | AlreadyVoted | Address has already voted on this proposal |
| 103 | ProposalExpired | Voting period has ended |
| 104 | InsufficientStake | Voter holds no governance tokens |
| 105 | InvalidStatus | Proposal is not in the required state for the operation |

---

## Integration

> Tip: use Ctrl+F / Cmd+F to search this page. Have a question that isn't answered here? Open a PR adding it to this section using the [PR template](../.github/PULL_REQUEST_TEMPLATE.md) — community-contributed questions are welcome.

**Q: How do I integrate VoteChain with my DAO token?**  
A: Pass your token's contract ID as `voting_token` when calling `initialize` on the governance contract ([`contracts/governance/src/lib.rs`](../contracts/governance/src/lib.rs)). The token must implement the standard Soroban token interface (at minimum `balance`), because vote weight is read from it when `cast_vote` is called — see [ADR-002](adr/ADR-002-token-weighted-voting.md) and [ADR-003](adr/ADR-003-live-balance-over-snapshot.md). Stellar classic assets can be used through their Stellar Asset Contract (SAC) address. For multiple tokens see [ADR-005 multi-asset voting](ADR-005-multi-asset-voting.md).

**Q: How do I index historical proposals?**  
A: Every state transition emits an on-chain event (`created`, `vote`, `final`, `executed`, `cancelled`, …) — see [events.md](events.md) and [ADR-005](adr/ADR-005-on-chain-events.md). The bundled [indexer](../indexer/README.md) reads these events via Soroban RPC `getEvents` and stores them for the [API](api-reference.md). For a one-off backfill, iterate `get_proposal(id)` for every id up to `proposal_count()`. RPC only retains recent events, so run the indexer continuously to keep full history.

**Q: What happens if the indexer is offline?**  
A: Nothing on-chain is affected — proposals, votes and finalisation are enforced by the contracts, not the indexer. Only off-chain reads (API, frontend lists) become stale. When it restarts, the indexer resumes from its last processed ledger; if the gap exceeds the RPC event retention window, rebuild state by reading `get_proposal` / `has_voted` directly. See [indexer/README.md](../indexer/README.md).

**Q: Can proposals be edited after creation?**  
A: No. Title, description and duration are immutable once `create_proposal` succeeds, so voters always see exactly what they vote on. The admin can adjust quorum via `update_quorum` (emits a `qupdate` event). For any other change, the admin cancels the proposal and a new one is created. See [lifecycle.md](lifecycle.md).

**Q: How do I test against mainnet?**  
A: Don't send test transactions to mainnet. Instead: (1) run `cargo test` — the Soroban test environment mirrors on-chain semantics; (2) deploy to testnet with [testnet-deployment.md](testnet-deployment.md); (3) for mainnet parity, simulate calls against mainnet state with `stellar contract invoke ... --network mainnet --send=no`, which never submits a transaction. Production rollout follows the [mainnet runbook](mainnet-runbook.md) and [compatibility.md](compatibility.md).
