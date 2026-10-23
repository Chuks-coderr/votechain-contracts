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
#
# Post-deploy smoke test for the staging environment. (#67)
#
# Exercises the full proposal lifecycle against the contracts deployed by
# `scripts/deploy_staging.sh`: initialise, create a proposal, cast a vote,
# and finalise it. Uses a fresh keypair funded from the Stellar testnet
# friendbot so the test never touches a real funded account.
#
# Requires: stellar CLI, curl, jq
# Reads:    .env.staging (written by scripts/deploy_staging.sh)
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.staging}"
RPC_URL="${SOROBAN_RPC_URL:-https://soroban-testnet.stellar.org}"
PASSPHRASE="${STELLAR_NETWORK_PASSPHRASE:-Test SDF Network ; September 2015}"
FRIENDBOT_URL="${FRIENDBOT_URL:-https://friendbot.stellar.org}"
KEY_NAME="smoke-test-$(date -u +%s)"
# Voting window: long enough that the cast_vote transaction reliably lands
# before end_time on a real network (testnet ledgers close every ~5s), but
# short enough that the CI job doesn't stall.
VOTE_DURATION_SECONDS="${VOTE_DURATION_SECONDS:-60}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found. Run scripts/deploy_staging.sh first." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

if [[ -z "${TOKEN_CONTRACT_ID:-}" || -z "${GOVERNANCE_CONTRACT_ID:-}" ]]; then
  echo "Error: TOKEN_CONTRACT_ID / GOVERNANCE_CONTRACT_ID missing from $ENV_FILE" >&2
  exit 1
fi

echo "== Staging smoke test =="
echo "  RPC:        $RPC_URL"
echo "  Token:      $TOKEN_CONTRACT_ID"
echo "  Governance: $GOVERNANCE_CONTRACT_ID"

echo "-- Generating fresh keypair: $KEY_NAME"
stellar keys generate "$KEY_NAME" --no-fund >/dev/null
ADDRESS=$(stellar keys address "$KEY_NAME")
echo "   address: $ADDRESS"

echo "-- Funding from friendbot"
curl -sf "${FRIENDBOT_URL}/?addr=${ADDRESS}" >/dev/null \
  || { echo "Error: friendbot funding failed for $ADDRESS" >&2; exit 1; }

_invoke() {
  local id="$1"; shift
  stellar contract invoke \
    --id "$id" \
    --source "$KEY_NAME" \
    --rpc-url "$RPC_URL" \
    --network-passphrase "$PASSPHRASE" \
    -- "$@"
}

echo "-- Initialising token contract"
_invoke "$TOKEN_CONTRACT_ID" initialize \
  --admin "$ADDRESS" \
  --initial_supply 1000000

echo "-- Initialising governance contract"
_invoke "$GOVERNANCE_CONTRACT_ID" initialize \
  --admin "$ADDRESS" \
  --voting_token "$TOKEN_CONTRACT_ID" \
  --min_proposal_balance 0 \
  --proposal_cooldown 0 \
  --min_duration 1 \
  --max_duration 86400 \
  --restrict_admin_vote false \
  --timelock_duration 0 \
  --max_active_proposals 0

echo "-- Creating proposal"
PROPOSAL_ID=$(_invoke "$GOVERNANCE_CONTRACT_ID" create_proposal \
  --proposer "$ADDRESS" \
  --title "Staging smoke test" \
  --description "Automated post-deploy smoke test (#67)" \
  --quorum 1 \
  --duration "$VOTE_DURATION_SECONDS" | tr -d '"')
echo "   proposal id: $PROPOSAL_ID"

echo "-- Casting vote"
_invoke "$GOVERNANCE_CONTRACT_ID" cast_vote \
  --voter "$ADDRESS" \
  --proposal_id "$PROPOSAL_ID" \
  --vote Yes

echo "-- Waiting for voting window to close (${VOTE_DURATION_SECONDS}s)"
sleep "$((VOTE_DURATION_SECONDS + 5))"

echo "-- Finalising proposal"
_invoke "$GOVERNANCE_CONTRACT_ID" finalise \
  --proposal_id "$PROPOSAL_ID"

echo "== Staging smoke test passed: proposal $PROPOSAL_ID initialised, voted, and finalised =="
