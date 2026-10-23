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

# Shared helpers for VoteChain deploy scripts. Source this file:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# get_passphrase <network>
# Prints the Stellar network passphrase for the given network name.
# If STELLAR_NETWORK_PASSPHRASE is set, it takes precedence (manual override).
# Returns non-zero with a clear error for unknown network names.
get_passphrase() {
  local network="${1:-}"
  if [ -n "${STELLAR_NETWORK_PASSPHRASE:-}" ]; then
    echo "$STELLAR_NETWORK_PASSPHRASE"
    return 0
  fi
  case "$network" in
    local|standalone) echo "Standalone Network ; February 2017" ;;
    testnet)          echo "Test SDF Network ; September 2015" ;;
    mainnet|public)   echo "Public Global Stellar Network ; September 2015" ;;
    *)
      echo "ERROR: Unknown network '$network'. Supported networks: local, testnet, mainnet." >&2
      echo "       Set STELLAR_NETWORK_PASSPHRASE to override manually." >&2
      return 1
      ;;
  esac
}
