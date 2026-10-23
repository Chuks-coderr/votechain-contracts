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
# Verifies that every `ContractError` variant declared in the governance and
# token contracts is documented in docs/errors.md. Fails with a non-zero exit
# code and a list of the missing variants if any are found, so a new error
# variant can't silently ship without a documented cause/resolution.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ERRORS_DOC="$REPO_ROOT/docs/errors.md"
FAILED=0

check_enum() {
  local label="$1"
  local types_file="$2"

  if [ ! -f "$types_file" ]; then
    echo "ERROR: $types_file not found"
    FAILED=1
    return
  fi

  # Extract variant names from the ContractError enum: lines like
  # "    VariantName = 12," inside the #[contracterror] block.
  local in_enum=0
  local variant
  while IFS= read -r line; do
    if [[ "$line" =~ ^pub[[:space:]]+enum[[:space:]]+ContractError ]]; then
      in_enum=1
      continue
    fi
    if [ "$in_enum" -eq 1 ]; then
      if [[ "$line" =~ ^\} ]]; then
        break
      fi
      if [[ "$line" =~ ^[[:space:]]*([A-Za-z][A-Za-z0-9]*)[[:space:]]*=[[:space:]]*[0-9]+ ]]; then
        variant="${BASH_REMATCH[1]}"
        if ! grep -q "\`$variant\`" "$ERRORS_DOC"; then
          echo "MISSING: $label::$variant is not documented in docs/errors.md"
          FAILED=1
        fi
      fi
    fi
  done < "$types_file"
}

check_enum "governance::ContractError" "$REPO_ROOT/contracts/governance/src/types.rs"
check_enum "token::ContractError" "$REPO_ROOT/contracts/token/src/types.rs"

if [ "$FAILED" -ne 0 ]; then
  echo ""
  echo "docs/errors.md is out of date. Add a row for each missing variant" \
       "(error name, code, description, raising function(s), resolution)."
  exit 1
fi

echo "docs/errors.md covers every ContractError variant in both contracts."
