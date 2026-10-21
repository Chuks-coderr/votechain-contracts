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

# DO-007: Deploy VoteChain contracts to Stellar mainnet.
#
# Usage:
#   ./scripts/deploy_mainnet.sh --mainnet              # interactive deploy
#   ./scripts/deploy_mainnet.sh --mainnet --dry-run    # dry-run (no transactions)
#
# Requirements:
#   - stellar CLI installed and configured
#   - STELLAR_SECRET_KEY env var set (deployer account)
#   - STELLAR_ADMIN_ADDRESS env var set (contract admin address)
#   - --mainnet flag required to prevent accidental deployment
set -euo pipefail

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# ── Defaults ──────────────────────────────────────────────────────────────────
MAINNET=false
DRY_RUN=false
ENV_FILE=".env.mainnet"
NETWORK="mainnet"
RPC_URL="https://horizon.stellar.org"
NETWORK_PASSPHRASE="$(get_passphrase "$NETWORK")"

# ── Argument parsing ───────────────────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --mainnet)  MAINNET=true ;;
    --dry-run)  DRY_RUN=true ;;
    *)          echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# ── Safety gate ───────────────────────────────────────────────────────────────
if [[ "$MAINNET" != "true" ]]; then
  echo "❌  --mainnet flag is required to deploy to mainnet."
  echo "    Use --dry-run to simulate without sending transactions."
  exit 1
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo "ℹ️  $*"; }
success() { echo "✅  $*"; }
warn()    { echo "⚠️  $*"; }

confirm() {
  local prompt="$1"
  read -r -p "$prompt [yes/no]: " answer
  [[ "$answer" == "yes" ]] || { echo "Aborted."; exit 0; }
}

run_stellar() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [dry-run] stellar $*"
  else
    stellar "$@"
  fi
}

# ── Pre-flight checks ─────────────────────────────────────────────────────────
info "Running pre-flight checks..."

command -v stellar &>/dev/null || { echo "❌ stellar CLI not found"; exit 1; }

[[ -n "${STELLAR_SECRET_KEY:-}" ]] || {
  echo "❌ STELLAR_SECRET_KEY environment variable is not set"
  exit 1
}

[[ -n "${STELLAR_ADMIN_ADDRESS:-}" ]] || {
  echo "❌ STELLAR_ADMIN_ADDRESS environment variable is not set"
  exit 1
}

# Ensure WASM artifacts exist
WASM_DIR="target/wasm32-unknown-unknown/release"
GOVERNANCE_WASM="$WASM_DIR/votechain_governance.wasm"
TOKEN_WASM="$WASM_DIR/votechain_token.wasm"

if [[ ! -f "$GOVERNANCE_WASM" || ! -f "$TOKEN_WASM" ]]; then
  info "WASM artifacts not found — building..."
  stellar contract build
fi

success "Pre-flight checks passed"

# ── Confirmation prompt ───────────────────────────────────────────────────────
echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│          ⚠️   MAINNET DEPLOYMENT WARNING   ⚠️            │"
echo "├─────────────────────────────────────────────────────────┤"
echo "│  Network  : $NETWORK"
echo "│  RPC      : $RPC_URL"
echo "│  Admin    : $STELLAR_ADMIN_ADDRESS"
echo "│  Dry-run  : $DRY_RUN"
echo "└─────────────────────────────────────────────────────────┘"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
  warn "DRY-RUN mode — no transactions will be submitted."
else
  confirm "You are about to deploy to MAINNET. Are you sure?"
fi

# ── Deploy token contract ─────────────────────────────────────────────────────
echo ""
info "Deploying token contract..."
TOKEN_ID=$(run_stellar contract deploy \
  --wasm "$TOKEN_WASM" \
  --source "$STELLAR_SECRET_KEY" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  2>&1 | tail -1)

if [[ "$DRY_RUN" == "true" ]]; then
  TOKEN_ID="DRY_RUN_TOKEN_CONTRACT_ID"
fi
success "Token contract deployed: $TOKEN_ID"

# ── Deploy governance contract ────────────────────────────────────────────────
echo ""
info "Deploying governance contract..."
GOVERNANCE_ID=$(run_stellar contract deploy \
  --wasm "$GOVERNANCE_WASM" \
  --source "$STELLAR_SECRET_KEY" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  2>&1 | tail -1)

if [[ "$DRY_RUN" == "true" ]]; then
  GOVERNANCE_ID="DRY_RUN_GOVERNANCE_CONTRACT_ID"
fi
success "Governance contract deployed: $GOVERNANCE_ID"

# ── Initialize governance contract ───────────────────────────────────────────
echo ""
info "Initializing governance contract..."
run_stellar contract invoke \
  --id "$GOVERNANCE_ID" \
  --source "$STELLAR_SECRET_KEY" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- initialize \
  --admin "$STELLAR_ADMIN_ADDRESS" \
  --voting_token "$TOKEN_ID"
success "Governance contract initialized"

# ── Save contract IDs ─────────────────────────────────────────────────────────
echo ""
info "Saving contract IDs to $ENV_FILE..."
cat > "$ENV_FILE" <<EOF
# VoteChain Mainnet Deployment
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
VOTECHAIN_TOKEN_CONTRACT_ID=$TOKEN_ID
VOTECHAIN_GOVERNANCE_CONTRACT_ID=$GOVERNANCE_ID
STELLAR_ADMIN_ADDRESS=$STELLAR_ADMIN_ADDRESS
NETWORK=$NETWORK
EOF
success "Contract IDs saved to $ENV_FILE"

echo ""
echo "🎉  Deployment complete!"
echo "    Token contract    : $TOKEN_ID"
echo "    Governance contract: $GOVERNANCE_ID"
