# ADR-007: Voting Power Snapshot at Proposal Creation

**Status:** Proposed (Design Spike Phase)

**Date:** 2025-09-26

**Context:** Architectural Decision Record for voting power snapshot mechanism

**Superseded By:** TBD

---

## Summary

This ADR documents the design spike and feasibility analysis for capturing voter token balances at proposal creation time (rather than vote time) to prevent token transfers after proposal creation from affecting voting weight.

**Current Behavior (ADR-003):** Live balance snapshots — each vote captures the voter's balance at vote time.

**Proposed Behavior:** Creation-time snapshots — record voter balances when a proposal is created.

---

## Problem Statement

### Vulnerability: Post-Creation Balance Manipulation

In the current live-balance system, a user can:

1. See a proposal created with quorum Q
2. Acquire tokens (transfer from another wallet or liquidity pool)
3. Vote with the newly acquired balance
4. The vote weight reflects acquired balance, not original holdings

**Example:**
- Proposal A created with quorum of 5M tokens
- Total token supply: 10M (distributed across 5 holders, 2M each)
- User holds 2M tokens
- User acquires 3M more tokens via transfer/swap
- User votes with weight of 5M (newly acquired balance)
- Vote power inflated beyond original stake

### Risk Severity

**Severity:** Medium (feasibility to exploit depends on DEX liquidity and token holder willingness)

**Affected Assets:** Governance decisions and community treasury

**Likelihood:** Medium (requires coordinated action but is technically possible)

---

## Proposed Solution: Creation-Time Snapshots

### Design Option 1: Full Merkle Tree Snapshot

**Concept:** At proposal creation, capture a Merkle root of all token holder balances.

**Mechanism:**

```rust
struct ProposalSnapshot {
    proposal_id: u64,
    balance_root: BytesN<32>,   // Merkle root of all balances
    snapshot_ledger: u32,
}

pub fn create_proposal_with_snapshot(
    env: Env,
    proposer: Address,
    title: String,
    description: String,
    quorum: i128,
    duration: u64,
    balance_root: BytesN<32>,   // Merkle root provided by off-chain service
) -> Result<u64, ContractError>
```

**Pros:**
- Cryptographically proof of all balances at creation time
- No on-chain storage of individual balances
- Enables light-client verification

**Cons:**
- Requires off-chain Merkle tree computation and proof provision
- Increases proposal creation complexity
- Merkle proof verification adds gas cost per vote

**Storage Cost:** 32 bytes + ledger entry metadata (~160 bytes total)

### Design Option 2: Opt-In Per-Voter Snapshot

**Concept:** Voters explicitly register their balance at proposal creation. Unregistered voters cannot vote.

**Mechanism:**

```rust
pub fn create_proposal(env: Env, ...) -> Result<u64, ContractError>

pub fn register_for_proposal(
    env: Env,
    proposal_id: u64,
    voter: Address,
) -> Result<(), ContractError>
// Captures voter's balance at registration time
```

**Pros:**
- Simple to implement
- Known storage cost (linear to registered voters)
- No off-chain infrastructure needed

**Cons:**
- Extra step for voters (worse UX)
- May reduce participation if registration step forgotten
- Requires proposer/community to coordinate registration

**Storage Cost:** 16 bytes per registered voter (address + balance)

### Design Option 3: Hybrid Approach (Recommended)

**Concept:** Optional creation-time snapshot for high-stakes proposals. Default to live balance for standard proposals.

**Mechanism:**

```rust
pub fn create_proposal(
    env: Env,
    proposer: Address,
    title: String,
    description: String,
    quorum: i128,
    duration: u64,
    use_snapshot: bool,          // New parameter
    balance_root: Option<BytesN<32>>,  // Optional Merkle root
) -> Result<u64, ContractError>

pub fn cast_vote(
    env: Env,
    voter: Address,
    proposal_id: u64,
    vote: Vote,
) -> Result<(), ContractError> {
    // If proposal uses snapshot, require voter proof
    // Otherwise, use live balance (current behavior)
}
```

**Pros:**
- Backward compatible with existing proposals
- Proposers choose snapshot model based on risk tolerance
- Reduces storage for standard proposals

**Cons:**
- Added complexity
- Proposal creators must decide snapshot mode
- Two code paths to maintain

**Storage Cost:** Optional 32 bytes (Merkle root) per proposal

---

## Feasibility Analysis: Storage Constraints

Soroban storage has three tiers with different costs:

| Storage Type | Cost (per entry) | Persistence | Use Case |
|---|---|---|---|
| Instance | 100 basis points | Contract lifetime | Config |
| Persistent | 10 basis points | Expires after TTL | Per-proposal data |
| Temporary | 1 basis point | Expires quickly | Allowances |

### Scenario: 1,000 Token Holders, 100 Proposals, 50% Participation

#### Option 1: Merkle Tree (Storage Only)
- Merkle root per proposal: 32 bytes × 100 = 3,200 bytes
- Merkle proofs provided by client (not stored)
- **Total storage: 3,200 bytes (negligible)**

#### Option 2: Per-Voter Registration
- Snapshots: 16 bytes × (1,000 holders × 100 proposals × 50% participation) = 800,000 bytes
- **Total storage: 800 KB (high)**
- **Annual storage cost: ~$80-120 at Stellar pricing**

#### Option 3: Hybrid (Recommended)
- Only high-stakes proposals use snapshots (~20% adoption)
- Snapshots: 16 bytes × (1,000 holders × 20 proposals × 50% participation) = 160,000 bytes
- **Total storage: 160 KB (moderate)**
- **Annual storage cost: ~$16-24 at Stellar pricing**

**Conclusion:** Merkle tree approach is most storage-efficient; hybrid approach is practical middle ground.

---

## Implementation Considerations

### Off-Chain Snapshot Generation

If Merkle tree approach is chosen:

```javascript
// Off-chain: Generate Merkle tree
const balances = [
  { address: 'G...A', balance: 1000000n },
  { address: 'G...B', balance: 2000000n },
  { address: 'G...C', balance: 3000000n },
];

const tree = new MerkleTree(balances, hashFunction);
const root = tree.getRoot();

// Proposer includes root when creating proposal
const proposal = await governance.methods
  .create_proposal(
    title,
    description,
    quorum,
    duration,
    true,  // use_snapshot
    root   // Merkle root
  )
  .simulate(server);
```

### Voter Proof Generation

When voting, provide Merkle proof:

```javascript
// Off-chain: Generate proof for voter
const proof = tree.getProof(voterAddress);

// On-chain: cast_vote verifies proof
const vote = await governance.methods
  .cast_vote(
    proposalId,
    Vote.Yes,
    proof  // Merkle proof for verification
  )
  .simulate(server);
```

### Smart Contract Changes

```rust
// Add to Proposal struct
pub struct Proposal {
    // ... existing fields
    pub use_snapshot: bool,
    pub balance_root: Option<BytesN<32>>,  // Merkle root
}

// Add to cast_vote
pub fn cast_vote(
    env: Env,
    voter: Address,
    proposal_id: u64,
    vote: Vote,
    proof: Option<Vec<BytesN<32>>>,  // Merkle proof (if snapshot used)
) -> Result<(), ContractError> {
    let proposal = get_proposal(&env, proposal_id)?;
    
    if proposal.use_snapshot {
        // Verify Merkle proof
        verify_merkle_proof(&env, &proof, voter, &proposal.balance_root)?;
        // Extract balance from proof path
        let weight = extract_balance_from_proof(&proof)?;
    } else {
        // Current behavior: fetch live balance
        let weight = get_token_balance(&env, voter)?;
    }
    
    // Store vote with weight
    store_vote(&env, proposal_id, voter, vote, weight)?;
}
```

---

## Migration from Live Balance

### Phase 1: Snapshot Support (Backward Compatible)
- Add `use_snapshot` field to proposals
- Existing proposals continue with live balance
- New proposals can opt into snapshots

### Phase 2: Gradual Adoption
- Document snapshot mode in governance guides
- Recommend snapshots for high-stakes proposals (>5M quorum, >7 day duration)
- Monitor adoption and community feedback

### Phase 3: Optional Full Migration (Future)
- If consensus reached, migrate all future proposals to snapshot mode
- Existing live-balance proposals remain immutable
- Update ADR to reflect decision

---

## Threat Model Update

### Resolved

- **Token Acquisition Attack:** Users cannot acquire tokens post-creation to increase vote weight

### Remaining (Not Addressed by This ADR)

- **Flash Loan Attack:** Requires coordination with lending protocol (out of scope)
- **Validator Censorship:** Censoring votes on chain (Stellar security)
- **Governance Concentration:** Insufficient token distribution (governance design)

---

## Recommendation

**Proceed with Design Spike: Hybrid Approach (Option 3)**

**Rationale:**
- Merkle tree approach is storage-efficient and technically sound
- Hybrid model allows for gradual adoption without breaking changes
- Medium complexity is acceptable given security benefits
- Clear off-chain integration path for client libraries

### Next Steps

1. **Prototype Merkle tree verification** in Soroban (2-3 days)
2. **Estimate gas cost** for Merkle proof verification
3. **Design off-chain snapshot service** (optional, community-provided)
4. **Community feedback period** (1 week)
5. **Decision:** Approve for implementation or pursue alternative

### Acceptance Criteria for Implementation

- [ ] Merkle proof verification passes all tests
- [ ] Gas cost < 5,000 Stroops per vote
- [ ] Backward compatibility maintained for live-balance proposals
- [ ] Community consensus on snapshot vs. live-balance tradeoff

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-09-26 | ADR Proposed | Design spike initiated to evaluate feasibility |
| TBD | Prototype Complete | Merkle tree verification tested |
| TBD | Implementation Approved | Community feedback integrated |

---

## References

- ADR-003: Live Balance Snapshots
- Soroban Storage Costs: https://developers.stellar.org/docs/learn/smart-contract-fundamentals/storage
- Merkle Tree Proofs: https://en.wikipedia.org/wiki/Merkle_tree
- Flash Loan Attacks: https://en.wikipedia.org/wiki/Flash_loan
