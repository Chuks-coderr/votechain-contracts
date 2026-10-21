#!/usr/bin/env bash
# Rotate the governance contract admin using the two-step SEC-006 flow.
#
# Usage:
#   NETWORK=testnet CONTRACT_ID=C... CURRENT_ADMIN=<identity> NEW_ADMIN=G... \
#     ./scripts/rotate-admin.sh propose [window_secs]
#   NETWORK=testnet CONTRACT_ID=C... NEW_ADMIN_IDENTITY=<identity> \
#     ./scripts/rotate-admin.sh accept
#
# `propose` is signed by the current admin key and emits the on-chain
# `admin_transfer_proposed` (admprop) audit event. `accept` is signed by the
# nominee and must be executed within the window (default 48h).
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
CONFIG="config/${NETWORK}.toml"
STEP="${1:-}"
WINDOW_SECS="${2:-0}"   # 0 = contract default (48h)

die() { echo "Error: $*" >&2; exit 1; }

[[ -f "$CONFIG" ]] || die "config file '$CONFIG' not found (valid: local, testnet, mainnet)"
[[ -n "${CONTRACT_ID:-}" ]] || die "CONTRACT_ID must be set"
command -v stellar >/dev/null || die "stellar CLI not found"
command -v curl >/dev/null || die "curl not found"

rpc_url=$(grep 'rpc_url' "$CONFIG" | sed 's/.*= *"\(.*\)"/\1/')
passphrase=$(grep 'network_passphrase' "$CONFIG" | sed 's/.*= *"\(.*\)"/\1/')
horizon_url=$(grep 'horizon_url' "$CONFIG" | sed 's/.*= *"\(.*\)"/\1/' || true)
if [[ -z "$horizon_url" ]]; then
  case "$NETWORK" in
    mainnet) horizon_url="https://horizon.stellar.org" ;;
    testnet) horizon_url="https://horizon-testnet.stellar.org" ;;
    *)       horizon_url="http://localhost:8000" ;;
  esac
fi

invoke() {
  local source="$1"; shift
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$source" \
    --rpc-url "$rpc_url" \
    --network-passphrase "$passphrase" \
    -- "$@"
}

# Validates that an account exists (is funded/active) on Stellar via Horizon.
check_funded() {
  local addr="$1"
  [[ "$addr" =~ ^G[A-Z2-7]{55}$ ]] || die "'$addr' is not a valid Stellar account address"
  local body
  body=$(curl -fsS "$horizon_url/accounts/$addr") \
    || die "account $addr not found on $NETWORK — fund/activate it before rotating"
  local native
  native=$(echo "$body" | grep -o '"balance": *"[0-9.]*",[^}]*"asset_type": *"native"' \
    | head -1 | sed 's/.*"balance": *"\([0-9.]*\)".*/\1/')
  [[ -n "$native" ]] || die "could not read native balance for $addr"
  awk "BEGIN{exit !($native > 0)}" || die "account $addr has zero XLM balance"
  echo "✓ $addr is active on $NETWORK (balance: $native XLM)"
}

confirm() {
  local prompt="$1" expected="$2" answer
  read -r -p "$prompt" answer
  [[ "$answer" == "$expected" ]] || die "confirmation mismatch — aborting"
}

case "$STEP" in
  propose)
    [[ -n "${CURRENT_ADMIN:-}" ]] || die "CURRENT_ADMIN (stellar identity of current admin) must be set"
    [[ -n "${NEW_ADMIN:-}" ]] || die "NEW_ADMIN (G... address) must be set"

    current_addr=$(stellar keys address "$CURRENT_ADMIN") || die "unknown identity '$CURRENT_ADMIN'"
    [[ "$current_addr" != "$NEW_ADMIN" ]] || die "NEW_ADMIN is the same as the current admin"

    # The contract enforces admin.require_auth(); a non-admin key will be rejected on-chain.
    check_funded "$NEW_ADMIN"

    echo
    echo "About to PROPOSE admin transfer on $NETWORK"
    echo "  contract : $CONTRACT_ID"
    echo "  current  : $current_addr"
    echo "  nominee  : $NEW_ADMIN"
    echo "  window   : ${WINDOW_SECS}s (0 = 48h default)"
    confirm "Type the CURRENT admin address to confirm: " "$current_addr"

    invoke "$CURRENT_ADMIN" propose_admin_transfer \
      --admin "$current_addr" --new_admin "$NEW_ADMIN" --window_secs "$WINDOW_SECS"
    echo "✓ Proposed. An 'admprop' (admin_transfer_proposed) event was emitted on-chain."
    echo "  Next: the nominee runs '$0 accept' within the window."
    ;;

  accept)
    [[ -n "${NEW_ADMIN_IDENTITY:-}" ]] || die "NEW_ADMIN_IDENTITY (stellar identity of nominee) must be set"
    new_addr=$(stellar keys address "$NEW_ADMIN_IDENTITY") || die "unknown identity '$NEW_ADMIN_IDENTITY'"

    check_funded "$new_addr"

    echo
    echo "About to ACCEPT admin transfer on $NETWORK"
    echo "  contract : $CONTRACT_ID"
    echo "  new admin: $new_addr"
    confirm "Type the NEW admin address to confirm: " "$new_addr"

    invoke "$NEW_ADMIN_IDENTITY" accept_admin_transfer --new_admin "$new_addr"
    echo "✓ Accepted. An 'admxfer' event was emitted; $new_addr is now admin."
    echo "  Next: archive/revoke the old admin key material (see SEC-006 runbook)."
    ;;

  *)
    sed -n '2,12p' "$0"; exit 1 ;;
esac
