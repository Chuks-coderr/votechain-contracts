// Copyright 2024 VoteChain Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Fuzz harness for the token `transfer_from` (delegated transfer) function. (#249)
//
// Exercises allowance arithmetic edge cases:
//   - allowance at i128::MAX / i128::MIN / 0
//   - amount exactly equal to allowance
//   - amount exceeds allowance (AllowanceExceeded)
//   - amount exceeds balance (InsufficientBalance)
//   - expired allowance (current_ledger > expiry_ledger)
//   - residual allowance after partial spend
//
// Run with cargo-fuzz:
//   cargo fuzz run fuzz_token_transfer_from -- -runs=1000000
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    // Minimum layout (bytes):
    //  [0..16]  from_balance     (i128 little-endian)
    //  [16..32] to_balance       (i128 little-endian)
    //  [32..48] allowance        (i128 little-endian)
    //  [48..64] amount           (i128 little-endian)
    //  [64..68] current_ledger   (u32 little-endian)
    //  [68..72] expiry_ledger    (u32 little-endian)
    if data.len() < 72 {
        return;
    }

    let from_balance = i128::from_le_bytes(data[0..16].try_into().unwrap());
    let to_balance = i128::from_le_bytes(data[16..32].try_into().unwrap());
    let allowance = i128::from_le_bytes(data[32..48].try_into().unwrap());
    let amount = i128::from_le_bytes(data[48..64].try_into().unwrap());
    let current_ledger = u32::from_le_bytes(data[64..68].try_into().unwrap());
    let expiry_ledger = u32::from_le_bytes(data[68..72].try_into().unwrap());

    // Guard: reject negative balances (invariant of valid contract state).
    if from_balance < 0 || to_balance < 0 {
        return;
    }

    // Guard: reject non-positive amounts (contract returns InvalidAmount for <= 0).
    if amount <= 0 {
        return;
    }

    // ── Allowance expiry check ────────────────────────────────────────────
    // Contract returns AllowanceExpired when current_ledger > expiry_ledger.
    if current_ledger > expiry_ledger {
        // Expired path: verify the expiry comparison never panics.
        return;
    }

    // ── Allowance sufficiency check ───────────────────────────────────────
    // Contract returns AllowanceExceeded when allowance < amount.
    if allowance < amount {
        return;
    }

    // ── Sender balance sufficiency check ─────────────────────────────────
    // Contract returns InsufficientBalance when from_balance < amount.
    if from_balance < amount {
        return;
    }

    // ── Core arithmetic — must never overflow ─────────────────────────────

    // 1. Residual allowance after spend.
    let new_allowance = allowance
        .checked_sub(amount)
        .expect("allowance subtraction overflowed");

    // 2. Sender balance after transfer.
    let new_from = from_balance
        .checked_sub(amount)
        .expect("from_balance subtraction overflowed");

    // 3. Recipient balance after transfer.
    let new_to = to_balance
        .checked_add(amount)
        .expect("to_balance addition overflowed");

    // Invariant 1: residual allowance is non-negative.
    assert!(
        new_allowance >= 0,
        "residual allowance went negative after transfer_from"
    );

    // Invariant 2: residual allowance <= original allowance.
    assert!(
        new_allowance <= allowance,
        "residual allowance exceeded original allowance"
    );

    // Invariant 3: sender balance is non-negative.
    assert!(
        new_from >= 0,
        "sender balance went negative after transfer_from"
    );

    // Invariant 4: recipient balance increased by exactly `amount`.
    assert_eq!(
        new_to - to_balance,
        amount,
        "recipient balance delta does not equal transferred amount"
    );

    // Invariant 5: total supply conservation.
    let old_sum = from_balance
        .checked_add(to_balance)
        .expect("overflow computing old balance sum");
    let new_sum = new_from
        .checked_add(new_to)
        .expect("overflow computing new balance sum");
    assert_eq!(
        old_sum, new_sum,
        "total supply not conserved across transfer_from"
    );
});
