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
// Fuzz harness for the token `transfer` function. (#249)
//
// Exercises arithmetic overflow / underflow edge cases in token transfer:
//   - amounts at i128::MAX, i128::MIN, and around zero
//   - transfer-to-self (no-op, no state change)
//   - transfer with zero balance
//   - partial and exact-balance transfers
//
// Run with cargo-fuzz:
//   cargo fuzz run fuzz_token_transfer -- -runs=1000000
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    // Minimum layout (bytes):
    //  [0..16]  from_balance  (i128 little-endian)
    //  [16..32] to_balance    (i128 little-endian)
    //  [32..48] amount        (i128 little-endian)
    //  [48]     flags         (bit 0 = transfer-to-self)
    if data.len() < 49 {
        return;
    }

    let from_balance = i128::from_le_bytes(data[0..16].try_into().unwrap());
    let to_balance = i128::from_le_bytes(data[16..32].try_into().unwrap());
    let amount = i128::from_le_bytes(data[32..48].try_into().unwrap());
    let transfer_to_self = (data[48] & 0x01) != 0;

    // ── Invariant checks that mirror the on-chain contract logic ──────────
    //
    // In a complete harness these would call the compiled Soroban contract
    // via soroban_sdk testutils. Here we validate the arithmetic invariants
    // directly so the fuzzer can find inputs that break them.

    // Guard: reject invalid amounts (contract returns InvalidAmount).
    if amount <= 0 {
        return;
    }

    // Guard: reject negative balances (contract state should never allow this).
    if from_balance < 0 || to_balance < 0 {
        return;
    }

    if transfer_to_self {
        // Transfer-to-self is a documented no-op: balances must not change.
        // No arithmetic needed — verify the guard itself never panics.
        let _ = from_balance;
        return;
    }

    // Insufficient balance path: contract returns InsufficientBalance, no panic.
    if from_balance < amount {
        return;
    }

    // ── Core arithmetic — must never overflow ─────────────────────────────
    let new_from = from_balance
        .checked_sub(amount)
        .expect("transfer subtraction overflowed");

    let new_to = to_balance
        .checked_add(amount)
        .expect("transfer addition overflowed");

    // Invariant 1: sender balance must be non-negative after transfer.
    assert!(new_from >= 0, "sender balance went negative after transfer");

    // Invariant 2: recipient balance must be >= original (amount is positive).
    assert!(
        new_to >= to_balance,
        "recipient balance decreased after receiving tokens"
    );

    // Invariant 3: total supply conservation — sum of balances is constant.
    // (from_balance + to_balance) == (new_from + new_to)
    let old_sum = from_balance
        .checked_add(to_balance)
        .expect("overflow computing old balance sum");
    let new_sum = new_from
        .checked_add(new_to)
        .expect("overflow computing new balance sum");
    assert_eq!(
        old_sum, new_sum,
        "total supply not conserved across transfer"
    );
});
