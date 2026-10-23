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

# TEST-016: Validate WASM build output for both contracts.
# Usage: ./scripts/test_wasm.sh
# Requires: stellar CLI, wasm-opt (optional)
set -euo pipefail

WASM_DIR="target/wasm32-unknown-unknown/release"
GOVERNANCE_WASM="$WASM_DIR/votechain_governance.wasm"
TOKEN_WASM="$WASM_DIR/votechain_token.wasm"

pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; exit 1; }

echo "=== WASM Build Validity Tests ==="

# 1. Build
echo ""
echo "1. Building contracts..."
stellar contract build
pass "Build succeeded"

# 2. WASM files exist and are non-empty
echo ""
echo "2. Checking WASM artifacts exist and are non-empty..."
for wasm in "$GOVERNANCE_WASM" "$TOKEN_WASM"; do
    [[ -f "$wasm" ]] || fail "Missing: $wasm"
    size=$(wc -c < "$wasm")
    [[ "$size" -gt 0 ]] || fail "Empty WASM: $wasm"
    pass "$wasm (${size} bytes)"
done

# 3. soroban contract inspect (validates ABI / interface)
echo ""
echo "3. Inspecting contract interfaces..."
stellar contract inspect --wasm "$GOVERNANCE_WASM" > /dev/null
pass "governance contract inspect passed"

stellar contract inspect --wasm "$TOKEN_WASM" > /dev/null
pass "token contract inspect passed"

# 4. Verify expected function exports exist in governance contract
echo ""
echo "4. Checking governance ABI exports..."
GOVERNANCE_SPEC=$(stellar contract inspect --wasm "$GOVERNANCE_WASM")
for fn in initialize create_proposal cast_vote finalise execute cancel get_proposal proposal_count has_voted; do
    echo "$GOVERNANCE_SPEC" | grep -q "$fn" || fail "Missing export: $fn"
    pass "export: $fn"
done

# 5. Verify expected function exports exist in token contract
echo ""
echo "5. Checking token ABI exports..."
TOKEN_SPEC=$(stellar contract inspect --wasm "$TOKEN_WASM")
for fn in initialize total_supply balance transfer approve transfer_from mint burn; do
    echo "$TOKEN_SPEC" | grep -q "$fn" || fail "Missing export: $fn"
    pass "export: $fn"
done

# 6. Reproducibility check: rebuild and compare checksums
echo ""
echo "6. Checking build reproducibility..."
sha1_before=$(sha1sum "$GOVERNANCE_WASM" | awk '{print $1}')
stellar contract build > /dev/null 2>&1
sha1_after=$(sha1sum "$GOVERNANCE_WASM" | awk '{print $1}')
[[ "$sha1_before" == "$sha1_after" ]] || fail "Governance WASM is not reproducible"
pass "governance WASM is reproducible"

sha1_before=$(sha1sum "$TOKEN_WASM" | awk '{print $1}')
stellar contract build > /dev/null 2>&1
sha1_after=$(sha1sum "$TOKEN_WASM" | awk '{print $1}')
[[ "$sha1_before" == "$sha1_after" ]] || fail "Token WASM is not reproducible"
pass "token WASM is reproducible"

echo ""
echo "=== All WASM validity tests passed ✅ ==="
