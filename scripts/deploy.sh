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

# Deploy governance and token contracts to the selected NETWORK.
# Usage: NETWORK=testnet ./scripts/deploy.sh
# Contract IDs are written to .env.<NETWORK> after a successful deploy.
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

rpc_url=$(grep 'rpc_url' "$CONFIG" | sed 's/.*= *"\(.*\)"/\1/')
passphrase="${STELLAR_NETWORK_PASSPHRASE:-$(grep 'network_passphrase' "$CONFIG" | sed 's/.*= *"\(.*\)"/\1/' || true)}"
if [[ -z "$passphrase" ]]; then
  passphrase=$(get_passphrase "$NETWORK")
fi

echo "Deploying to: $NETWORK  (RPC: $rpc_url)"

stellar contract build

_deploy() {
  local wasm="$1"
  stellar contract deploy \
    --wasm "$wasm" \
    --rpc-url "$rpc_url" \
    --network-passphrase "$passphrase"
}

TOKEN_ID=$(_deploy target/wasm32-unknown-unknown/release/votechain_token.wasm)
GOVERNANCE_ID=$(_deploy target/wasm32-unknown-unknown/release/votechain_governance.wasm)

# Write (or overwrite) the env file — idempotent
cat > "$ENV_FILE" <<EOF
NETWORK=${NETWORK}
TOKEN_CONTRACT_ID=${TOKEN_ID}
GOVERNANCE_CONTRACT_ID=${GOVERNANCE_ID}
EOF

echo "Contract IDs saved to $ENV_FILE"
echo "  TOKEN_CONTRACT_ID=${TOKEN_ID}"
echo "  GOVERNANCE_CONTRACT_ID=${GOVERNANCE_ID}"
