# Testnet Deployment and Interaction Guide

This guide walks you through deploying the VoteChain governance and token contracts to the Stellar testnet and interacting with them using the Soroban CLI.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Rust | 1.75+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| wasm32 target | — | `rustup target add wasm32-unknown-unknown` |
| Stellar CLI | **22.8.2** | `cargo install --locked stellar-cli@22.8.2 --features opt` |

Verify:

```bash
rustc --version
stellar --version
```

---

## Quick Start (copy-paste, targets Stellar CLI 22.8.2)

Set these once; every later command uses them:

```bash
export NETWORK=testnet
export SOURCE=deployer
export ADMIN=$(stellar keys address "$SOURCE")   # after step 1 below
```

```bash
# 1. Create + fund an account with Friendbot
stellar keys generate --global "$SOURCE" --network "$NETWORK" --fund
export ADMIN=$(stellar keys address "$SOURCE")

# 2 + 3. Build and deploy token + governance (writes .env.testnet)
NETWORK=$NETWORK ./scripts/deploy.sh
set -a; source ".env.$NETWORK"; set +a    # exports TOKEN_CONTRACT_ID, GOVERNANCE_CONTRACT_ID

# 4. Initialize the token
stellar contract invoke --id "$TOKEN_CONTRACT_ID" --source "$SOURCE" --network "$NETWORK"   -- initialize --admin "$ADMIN" --initial_supply 1000000000

# 5. Initialize governance
stellar contract invoke --id "$GOVERNANCE_CONTRACT_ID" --source "$SOURCE" --network "$NETWORK"   -- initialize --admin "$ADMIN" --voting_token "$TOKEN_CONTRACT_ID"   --min_proposal_balance 0 --proposal_cooldown 0 --min_duration 60 --max_duration 1209600   --restrict_admin_vote false --timelock_duration 0 --max_active_proposals 10

# 6. Smoke test: create a proposal, vote, read it back
PID=$(stellar contract invoke --id "$GOVERNANCE_CONTRACT_ID" --source "$SOURCE" --network "$NETWORK"   -- create_proposal --proposer "$ADMIN" --title "Smoke test" --description "Deployment check"   --quorum 1 --duration 3600)
stellar contract invoke --id "$GOVERNANCE_CONTRACT_ID" --source "$SOURCE" --network "$NETWORK"   -- cast_vote --voter "$ADMIN" --proposal_id "$PID" --vote Yes
stellar contract invoke --id "$GOVERNANCE_CONTRACT_ID" --network "$NETWORK" -- get_proposal --proposal_id "$PID"
stellar contract invoke --id "$GOVERNANCE_CONTRACT_ID" --network "$NETWORK" -- get_state
```

> `scripts/deploy.sh` reads the RPC URL and passphrase from `config/testnet.toml`. If your CLI has no default source identity, set `export STELLAR_ACCOUNT=$SOURCE` before running it.

### Expected terminal output

```text
$ NETWORK=testnet ./scripts/deploy.sh
Deploying to: testnet  (RPC: https://soroban-testnet.stellar.org)
...
Contract IDs saved to .env.testnet
  TOKEN_CONTRACT_ID=CB...TOKEN
  GOVERNANCE_CONTRACT_ID=CC...GOV

$ stellar contract invoke ... -- create_proposal ...
1

$ stellar contract invoke ... -- get_state
"Ready"
```

(Contract IDs are abbreviated; yours will differ.) The step-by-step sections below explain each command in detail.

---

## Step 1: Fund a Testnet Account

You need a Stellar testnet keypair with XLM to pay transaction fees.

```bash
# Generate a new keypair
stellar keys generate --global deployer --network testnet

# Fund it via Friendbot (testnet only)
stellar keys fund deployer --network testnet
```

Check the balance:

```bash
stellar keys address deployer
# Copy the public key, then:
curl "https://friendbot.stellar.org?addr=<YOUR_PUBLIC_KEY>"
```

---

## Step 2: Build the Contracts

From the repository root:

```bash
make build
```

This produces two WASM binaries:

```
target/wasm32-unknown-unknown/release/votechain_token.wasm
target/wasm32-unknown-unknown/release/votechain_governance.wasm
```

---

## Step 3: Deploy the Token Contract

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/votechain_token.wasm \
  --source deployer \
  --network testnet
```

Save the output contract ID:

```bash
export TOKEN_ID=<CONTRACT_ID_FROM_OUTPUT>
```

### Initialize the Token Contract

```bash
stellar contract invoke \
  --id "$TOKEN_ID" \
  --source deployer \
  --network testnet \
  -- initialize \
  --admin $(stellar keys address deployer) \
  --initial_supply 1000000000
```

Verify the total supply:

```bash
stellar contract invoke \
  --id "$TOKEN_ID" \
  --network testnet \
  -- total_supply
```

---

## Step 4: Deploy the Governance Contract

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/votechain_governance.wasm \
  --source deployer \
  --network testnet
```

Save the output contract ID:

```bash
export GOVERNANCE_ID=<CONTRACT_ID_FROM_OUTPUT>
```

### Initialize the Governance Contract

```bash
stellar contract invoke \
  --id "$GOVERNANCE_ID" \
  --source deployer \
  --network testnet \
  -- initialize \
  --admin $(stellar keys address deployer) \
  --voting_token "$TOKEN_ID" \
  --min_proposal_balance 0 \
  --proposal_cooldown 0 \
  --restrict_admin_vote false \
  --timelock_duration 0
```

Verify the contract state:

```bash
stellar contract invoke \
  --id "$GOVERNANCE_ID" \
  --network testnet \
  -- get_state
```

Expected output: `"Ready"`

---

## Step 5: Save Contract IDs

The deploy script writes contract IDs automatically:

```bash
NETWORK=testnet ./scripts/deploy.sh
```

This creates `.env.testnet`:

```
NETWORK=testnet
TOKEN_CONTRACT_ID=C...
GOVERNANCE_CONTRACT_ID=C...
```

Load them in your shell:

```bash
source .env.testnet
```

---

## Step 6: Interact with the Contracts

### Mint Tokens to a Voter

```bash
stellar contract invoke \
  --id "$TOKEN_ID" \
  --source deployer \
  --network testnet \
  -- mint \
  --admin $(stellar keys address deployer) \
  --to <VOTER_ADDRESS> \
  --amount 500000
```

### Create a Proposal

```bash
stellar contract invoke \
  --id "$GOVERNANCE_ID" \
  --source deployer \
  --network testnet \
  -- create_proposal \
  --proposer $(stellar keys address deployer) \
  --title "Increase Treasury Allocation" \
  --description "Allocate 10M tokens to the community treasury for Q3 grants." \
  --quorum 100000 \
  --duration 3600
```

Save the returned proposal ID:

```bash
export PROPOSAL_ID=1
```

### Check Proposal State

```bash
stellar contract invoke \
  --id "$GOVERNANCE_ID" \
  --network testnet \
  -- get_proposal \
  --proposal_id "$PROPOSAL_ID"
```

### Cast a Vote

```bash
stellar contract invoke \
  --id "$GOVERNANCE_ID" \
  --source deployer \
  --network testnet \
  -- cast_vote \
  --voter $(stellar keys address deployer) \
  --proposal_id "$PROPOSAL_ID" \
  --vote '{"tag":"Yes","values":[]}'
```

Vote options: `'{"tag":"Yes","values":[]}'`, `'{"tag":"No","values":[]}'`, `'{"tag":"Abstain","values":[]}'`

### Check if an Address Has Voted

```bash
stellar contract invoke \
  --id "$GOVERNANCE_ID" \
  --network testnet \
  -- has_voted \
  --proposal_id "$PROPOSAL_ID" \
  --voter $(stellar keys address deployer)
```

### Finalise a Proposal (after voting period ends)

```bash
stellar contract invoke \
  --id "$GOVERNANCE_ID" \
  --source deployer \
  --network testnet \
  -- finalise \
  --proposal_id "$PROPOSAL_ID"
```

### Execute a Passed Proposal

```bash
stellar contract invoke \
  --id "$GOVERNANCE_ID" \
  --source deployer \
  --network testnet \
  -- execute \
  --admin $(stellar keys address deployer) \
  --proposal_id "$PROPOSAL_ID"
```

### Cancel an Active Proposal (admin only)

```bash
stellar contract invoke \
  --id "$GOVERNANCE_ID" \
  --source deployer \
  --network testnet \
  -- cancel \
  --admin $(stellar keys address deployer) \
  --proposal_id "$PROPOSAL_ID"
```

---

## Step 7: Verify on Stellar Expert

Browse your deployed contracts on the testnet explorer:

```
https://stellar.expert/explorer/testnet/contract/<CONTRACT_ID>
```

All events (votes, proposals, finalisations) are visible in the contract's event log.

---

## Troubleshooting

### `insufficient balance` on deploy

Your account needs XLM. Re-run Friendbot:

```bash
curl "https://friendbot.stellar.org?addr=$(stellar keys address deployer)"
```

### Insufficient XLM / `tx_insufficient_balance` / account not found

The source account is unfunded or ran out of testnet XLM (deploys cost more than invokes). Re-fund it:

```bash
stellar keys fund "$SOURCE" --network testnet
```

Friendbot is rate-limited; if it returns an error, wait a minute and retry.

### CLI version mismatch

Symptoms: `error: unexpected argument`, `unrecognized subcommand`, or XDR decode errors (`xdr value invalid`). Check and pin the version:

```bash
stellar --version            # expect stellar 22.8.2
cargo install --locked stellar-cli@22.8.2 --features opt --force
```

Older `soroban` CLI binaries use different flags — uninstall them or make sure `stellar` is first on your `PATH`.

### `AlreadyInitialized` error

The contract was already initialised. Each contract can only be initialised once. Deploy a fresh contract if you need a clean state.

### `VotingStillOpen` on finalise

The voting period has not ended yet. Wait until `end_time` has passed (check `get_proposal` for the `end_time` field).

### `NoVotingPower` on cast_vote

The voter has zero token balance. Mint tokens to the voter first using the token contract's `mint` function.

### Simulation vs submission

Add `--send=no` to any `stellar contract invoke` command to simulate without submitting:

```bash
stellar contract invoke \
  --id "$GOVERNANCE_ID" \
  --source deployer \
  --network testnet \
  --send=no \
  -- get_proposal \
  --proposal_id 1
```

---

## Network Configuration Reference

| Parameter | Testnet Value |
|-----------|--------------|
| RPC URL | `https://soroban-testnet.stellar.org` |
| Network passphrase | `Test SDF Network ; September 2015` |
| Explorer | `https://stellar.expert/explorer/testnet` |
| Friendbot | `https://friendbot.stellar.org` |

These values are also stored in `config/testnet.toml`.

---

## Full End-to-End Example Script

```bash
#!/usr/bin/env bash
set -euo pipefail

NETWORK=testnet
DEPLOYER=$(stellar keys address deployer)

# Build
make build

# Deploy token
TOKEN_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/votechain_token.wasm \
  --source deployer --network $NETWORK)

# Deploy governance
GOVERNANCE_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/votechain_governance.wasm \
  --source deployer --network $NETWORK)

# Initialize token (1 billion supply)
stellar contract invoke --id "$TOKEN_ID" --source deployer --network $NETWORK \
  -- initialize --admin "$DEPLOYER" --initial_supply 1000000000

# Initialize governance
stellar contract invoke --id "$GOVERNANCE_ID" --source deployer --network $NETWORK \
  -- initialize \
  --admin "$DEPLOYER" \
  --voting_token "$TOKEN_ID" \
  --min_proposal_balance 0 \
  --proposal_cooldown 0 \
  --restrict_admin_vote false \
  --timelock_duration 0

# Mint tokens to deployer for voting
stellar contract invoke --id "$TOKEN_ID" --source deployer --network $NETWORK \
  -- mint --admin "$DEPLOYER" --to "$DEPLOYER" --amount 1000000

# Create a proposal (1 hour duration)
PROPOSAL_ID=$(stellar contract invoke --id "$GOVERNANCE_ID" --source deployer --network $NETWORK \
  -- create_proposal \
  --proposer "$DEPLOYER" \
  --title "Test Proposal" \
  --description "A test proposal on testnet." \
  --quorum 500000 \
  --duration 3600)

echo "Deployed TOKEN_ID=$TOKEN_ID"
echo "Deployed GOVERNANCE_ID=$GOVERNANCE_ID"
echo "Created PROPOSAL_ID=$PROPOSAL_ID"
```
