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

# Deploy to the dedicated `staging` environment. (#67)
#
# Delegates to scripts/deploy.sh (which writes .env.staging), then mirrors
# the resulting contract IDs into config/staging.toml so the staging config
# file stays in sync with the latest deployment without manual editing.
set -euo pipefail

NETWORK=staging ./scripts/deploy.sh

ENV_FILE=".env.staging"
CONFIG_FILE="config/staging.toml"

if [[ -f "$ENV_FILE" && -f "$CONFIG_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"

  if [[ -n "${GOVERNANCE_CONTRACT_ID:-}" ]]; then
    sed -i.bak "s/^governance = .*/governance = \"${GOVERNANCE_CONTRACT_ID}\"/" "$CONFIG_FILE"
  fi
  if [[ -n "${TOKEN_CONTRACT_ID:-}" ]]; then
    sed -i.bak "s/^token = .*/token = \"${TOKEN_CONTRACT_ID}\"/" "$CONFIG_FILE"
  fi
  rm -f "${CONFIG_FILE}.bak"

  echo "Contract addresses written to $CONFIG_FILE"
fi
