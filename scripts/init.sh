#!/usr/bin/env bash
# Copyright 2024 VoteChain Contributors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Initialize deployed contracts on the selected NETWORK.
# Usage: NETWORK=testnet ./scripts/init.sh
# Requires: TOKEN_CONTRACT_ID, GOVERNANCE_CONTRACT_ID, SOROBAN_ACCOUNT, SOROBAN_SECRET_KEY
set -euo pipefail

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

NETWORK="${NETWORK:-local}"
CONFIG="config/${NETWORK}.toml"
ENV_FILE=".env.${NETWORK}"

if [[ ! -f "$CONFIG" ]]; then
  echo "Error: config file '$CONFIG' not found. Valid values: local, testnet, mainnet" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: env file '$ENV_FILE' not found. Run deploy.sh first." >&2
  exit 1
fi

# Load contract IDs and credentials
# shellcheck source=/dev/null
source "$ENV_FILE"

rpc_url=$(grep 'rpc_url' "$CONFIG" | sed 's/.*= *"\(.*\)"/\1/')
passphrase="${STELLAR_NETWORK_PASSPHRASE:-$(grep 'network_passphrase' "$CONFIG" | sed 's/.*= *"\(.*\)"/\1/' || true)}"
if [[ -z "$passphrase" ]]; then
  passphrase=$(get_passphrase "$NETWORK")
fi

# Required environment variables
: "${TOKEN_CONTRACT_ID:?TOKEN_CONTRACT_ID not set in $ENV_FILE}"
: "${GOVERNANCE_CONTRACT_ID:?GOVERNANCE_CONTRACT_ID not set in $ENV_FILE}"
: "${SOROBAN_ACCOUNT:?SOROBAN_ACCOUNT not set}"
: "${SOROBAN_SECRET_KEY:?SOROBAN_SECRET_KEY not set}"

echo "Initializing contracts on: $NETWORK (RPC: $rpc_url)"
echo "  Token: $TOKEN_CONTRACT_ID"
echo "  Governance: $GOVERNANCE_CONTRACT_ID"
echo "  Admin: $SOROBAN_ACCOUNT"

# Initialize token contract with 100M initial supply to admin
echo "Initializing token contract..."
stellar contract invoke \
  --id "$TOKEN_CONTRACT_ID" \
  --source "$SOROBAN_ACCOUNT" \
  --rpc-url "$rpc_url" \
  --network-passphrase "$passphrase" \
  --sign-with-key "$SOROBAN_SECRET_KEY" \
  -- initialize \
  --admin "$SOROBAN_ACCOUNT" \
  --initial_supply 100000000000000

# Initialize governance contract
# Parameters:
# - admin: SOROBAN_ACCOUNT
# - voting_token: TOKEN_CONTRACT_ID
# - min_proposal_balance: 1000000 (1M tokens)
# - proposal_cooldown: 86400 (1 day)
# - min_duration: 3600 (1 hour)
# - max_duration: 2592000 (30 days)
# - restrict_admin_vote: true
# - timelock_duration: 86400 (1 day)
# - max_active_proposals: 50
# - min_quorum_bps: 10 (0.1% of supply)
echo "Initializing governance contract..."
stellar contract invoke \
  --id "$GOVERNANCE_CONTRACT_ID" \
  --source "$SOROBAN_ACCOUNT" \
  --rpc-url "$rpc_url" \
  --network-passphrase "$passphrase" \
  --sign-with-key "$SOROBAN_SECRET_KEY" \
  -- initialize \
  --admin "$SOROBAN_ACCOUNT" \
  --voting_token "$TOKEN_CONTRACT_ID" \
  --min_proposal_balance 1000000 \
  --proposal_cooldown 86400 \
  --min_duration 3600 \
  --max_duration 2592000 \
  --restrict_admin_vote true \
  --timelock_duration 86400 \
  --max_active_proposals 50 \
  --min_quorum_bps 10

echo "✅ Contracts initialized successfully!"

# Verify initialization
echo "Verifying token contract..."
stellar contract invoke \
  --id "$TOKEN_CONTRACT_ID" \
  --rpc-url "$rpc_url" \
  --network-passphrase "$passphrase" \
  -- total_supply

echo "Verifying governance contract config..."
stellar contract invoke \
  --id "$GOVERNANCE_CONTRACT_ID" \
  --rpc-url "$rpc_url" \
  --network-passphrase "$passphrase" \
  -- get_config