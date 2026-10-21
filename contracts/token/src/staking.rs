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

//! # Staking Module — Time-Weighted Voting Power (ve-token model)
//!
//! This module implements the scaffold for governance token staking with
//! time-weighted voting power, as specified in ADR-013.
//!
//! ## Design Overview
//!
//! Stakers lock their tokens for a chosen duration (0–365 days).  Their
//! effective voting power is multiplied by a linear factor that scales from
//! **1× at 0 days** up to **4× at 365 days**.  Staked tokens are frozen for
//! transfers until `locked_until` has passed.
//!
//! ## Multiplier Formula
//!
//! ```text
//! multiplier(days) = 1 + 3 * (days / 365)   (scaled by MULTIPLIER_PRECISION)
//! ```
//!
//! ## Status
//!
//! **Scaffold / Work-in-progress.** Function bodies are stubs with TODO
//! comments.  This file exists to define the public API surface, data
//! structures, and doc-contracts before full implementation.
//!
//! See: [ADR-013](../../../../docs/adr/ADR-013-ve-token-staking.md),
//!      [SEC-013](../../../../docs/security/SEC-013-staking-lock-bypass.md)

#![allow(dead_code)]

use soroban_sdk::{contracttype, Address, Env};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum lock duration in days (365 days = 1 year).
pub const MAX_LOCK_DAYS: u64 = 365;

/// Seconds per day used for lock-period calculations.
pub const SECONDS_PER_DAY: u64 = 86_400;

/// Fixed-point precision factor for the voting-power multiplier.
///
/// All multiplier values are expressed as integers scaled by this factor so
/// that we can represent fractional multipliers (e.g., 2.5×) without
/// floating-point arithmetic.  A stored value of `25_000` with
/// `MULTIPLIER_PRECISION = 10_000` represents a 2.5× multiplier.
pub const MULTIPLIER_PRECISION: i128 = 10_000;

/// Minimum multiplier (1×), expressed in fixed-point units.
///
/// A staker who locks for 0 days receives no bonus — their raw balance is
/// used as-is.
pub const MIN_MULTIPLIER: i128 = 1 * MULTIPLIER_PRECISION; // 10_000

/// Maximum multiplier (4×), expressed in fixed-point units.
///
/// A staker who locks for the full `MAX_LOCK_DAYS` (365 days) receives a 4×
/// boost on their raw balance.
pub const MAX_MULTIPLIER: i128 = 4 * MULTIPLIER_PRECISION; // 40_000

// ---------------------------------------------------------------------------
// Data Structures
// ---------------------------------------------------------------------------

/// Immutable record of a single staking position.
///
/// Created when a holder calls [`stake`] and destroyed (or updated) when they
/// call [`unstake`].  Stored in persistent storage keyed by
/// `TokenDataKey::StakeRecord(staker)` (key variant to be added to
/// `types.rs`).
///
/// ## Invariants
///
/// - `amount > 0` — zero-amount stakes are rejected at entry.
/// - `lock_duration <= MAX_LOCK_DAYS * SECONDS_PER_DAY` — duration capped.
/// - `locked_until == env.ledger().timestamp() + lock_duration` at creation.
/// - Tokens represented by `amount` are removed from the transferable balance
///   and added back only once `locked_until` has passed.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct StakeRecord {
    /// The address that created this staking position.
    pub staker: Address,

    /// Number of tokens locked in this position.  Must be positive.
    pub amount: i128,

    /// Chosen lock duration in seconds (0 ≤ lock_duration ≤ 365 days in
    /// seconds).  This value is stored so that the multiplier can be
    /// re-derived from the record without reading the creation timestamp.
    pub lock_duration: u64,

    /// Absolute Unix timestamp (seconds since epoch) at which the lock
    /// expires.  Tokens cannot be transferred while
    /// `env.ledger().timestamp() < locked_until`.
    pub locked_until: u64,
}

// ---------------------------------------------------------------------------
// Multiplier Logic
// ---------------------------------------------------------------------------

/// Compute the voting-power multiplier for a given lock duration in **days**.
///
/// The multiplier scales linearly from [`MIN_MULTIPLIER`] (1×) at 0 days to
/// [`MAX_MULTIPLIER`] (4×) at [`MAX_LOCK_DAYS`] (365 days).  The return value
/// is a fixed-point integer scaled by [`MULTIPLIER_PRECISION`].
///
/// ## Formula
///
/// ```text
/// multiplier = MIN_MULTIPLIER + (MAX_MULTIPLIER - MIN_MULTIPLIER) * days / MAX_LOCK_DAYS
/// ```
///
/// ## Examples
///
/// | Lock duration | Return value | Effective multiplier |
/// |---------------|-------------|----------------------|
/// | 0 days        | 10_000      | 1.00×                |
/// | 91 days       | 17_493      | 1.75× (approx)       |
/// | 182 days      | 24_986      | 2.50× (approx)       |
/// | 365 days      | 40_000      | 4.00×                |
///
/// ## Clamping
///
/// If `lock_duration_days` exceeds [`MAX_LOCK_DAYS`], the return value is
/// clamped to [`MAX_MULTIPLIER`] to prevent integer overflow in callers.
///
/// # Arguments
///
/// * `lock_duration_days` — Lock duration in whole days (0–365).
///
/// # Returns
///
/// Fixed-point multiplier scaled by [`MULTIPLIER_PRECISION`].
pub fn voting_power_multiplier(lock_duration_days: u64) -> i128 {
    // Clamp to maximum lock period.
    let days = lock_duration_days.min(MAX_LOCK_DAYS);

    // Linear interpolation:
    //   multiplier = MIN + (MAX - MIN) * days / MAX_LOCK_DAYS
    //
    // All arithmetic is performed in i128 to avoid overflow when days and
    // MULTIPLIER_PRECISION are both large.
    let bonus = (MAX_MULTIPLIER - MIN_MULTIPLIER) * (days as i128) / (MAX_LOCK_DAYS as i128);
    MIN_MULTIPLIER + bonus
}

// ---------------------------------------------------------------------------
// Public API Stubs
// ---------------------------------------------------------------------------

/// Lock `amount` tokens for `lock_duration_seconds` seconds, minting a
/// [`StakeRecord`] and freezing the tokens against transfer.
///
/// ## Behaviour (not yet implemented)
///
/// 1. Require authorisation from `staker`.
/// 2. Validate that `amount > 0` and `lock_duration_seconds <=
///    MAX_LOCK_DAYS * SECONDS_PER_DAY`.
/// 3. Check that `staker` has sufficient **transferable** balance (i.e.,
///    `balance - already_staked >= amount`).
/// 4. Deduct `amount` from the transferable balance.
/// 5. Write a [`StakeRecord`] to persistent storage with:
///    - `staker` = caller
///    - `amount` = amount
///    - `lock_duration` = lock_duration_seconds
///    - `locked_until` = `env.ledger().timestamp() + lock_duration_seconds`
/// 6. Emit a `stake` event.
///
/// ## Errors (to be added to `ContractError`)
///
/// - `InvalidAmount` — amount ≤ 0
/// - `InvalidLockDuration` — lock_duration_seconds > MAX_LOCK_DAYS * SECONDS_PER_DAY
/// - `InsufficientBalance` — staker does not have enough transferable tokens
/// - `AlreadyStaked` — staker already has an active stake position (single
///   position per address in v1; extend in a future milestone)
///
/// # TODO
///
/// - [ ] Implement storage read/write using `TokenDataKey::StakeRecord`
/// - [ ] Integrate with `transfer` / `transfer_from` to enforce freeze
/// - [ ] Emit staking event via `events` module
/// - [ ] Add `AlreadyStaked` and `InvalidLockDuration` variants to `ContractError`
/// - [ ] Write unit tests covering happy path and all error branches
#[allow(unused_variables)]
pub fn stake(env: &Env, staker: Address, amount: i128, lock_duration_seconds: u64) {
    // TODO: staker.require_auth();
    // TODO: validate amount > 0
    // TODO: validate lock_duration_seconds <= MAX_LOCK_DAYS * SECONDS_PER_DAY
    // TODO: check staker transferable balance >= amount
    // TODO: deduct amount from transferable balance in storage
    // TODO: compute locked_until = env.ledger().timestamp() + lock_duration_seconds
    // TODO: write StakeRecord to persistent storage
    // TODO: emit stake event
    todo!("stake() not yet implemented — see ADR-013")
}

/// Release a staking position once the lock period has expired, restoring
/// the staked tokens to the transferable balance.
///
/// ## Behaviour (not yet implemented)
///
/// 1. Require authorisation from `staker`.
/// 2. Load the [`StakeRecord`] for `staker`; return `StakeNotFound` if absent.
/// 3. Assert that `env.ledger().timestamp() >= record.locked_until`; return
///    `StakeLocked` if the lock has not expired.
/// 4. Restore `record.amount` to the transferable balance.
/// 5. Delete the [`StakeRecord`] from persistent storage.
/// 6. Emit an `unstake` event.
///
/// ## Errors (to be added to `ContractError`)
///
/// - `StakeNotFound` — no active stake position for `staker`
/// - `StakeLocked` — lock period has not yet expired
///
/// # TODO
///
/// - [ ] Implement storage read/write using `TokenDataKey::StakeRecord`
/// - [ ] Add `StakeNotFound` and `StakeLocked` variants to `ContractError`
/// - [ ] Emit unstake event via `events` module
/// - [ ] Write unit tests covering happy path and locked-too-early error
#[allow(unused_variables)]
pub fn unstake(env: &Env, staker: Address) {
    // TODO: staker.require_auth();
    // TODO: load StakeRecord for staker — error if absent
    // TODO: assert env.ledger().timestamp() >= record.locked_until
    // TODO: restore record.amount to transferable balance
    // TODO: delete StakeRecord from persistent storage
    // TODO: emit unstake event
    todo!("unstake() not yet implemented — see ADR-013")
}

/// Return the effective voting power for `staker`, accounting for any active
/// staking position and the time-weighted multiplier.
///
/// ## Behaviour (not yet implemented)
///
/// 1. Load the raw token balance for `staker`.
/// 2. Attempt to load a [`StakeRecord`] for `staker`.
///    - If no record exists, return the raw balance (1× multiplier).
/// 3. Compute `lock_duration_days = record.lock_duration / SECONDS_PER_DAY`.
/// 4. Compute `multiplier = voting_power_multiplier(lock_duration_days)`.
/// 5. Return `record.amount * multiplier / MULTIPLIER_PRECISION`.
///
/// ## Note on Non-Staked Balance
///
/// Only the staked portion of the balance receives the multiplier boost.  Any
/// tokens held outside a staking position contribute their raw balance (1×)
/// as before.  This preserves backwards compatibility for non-stakers.
///
/// # Arguments
///
/// * `staker` — Address to query.
///
/// # Returns
///
/// Effective voting power as an `i128`.  Returns `0` if the address has no
/// balance and no stake.
///
/// # TODO
///
/// - [ ] Implement storage reads for balance and StakeRecord
/// - [ ] Integrate with `cast_vote` in the governance contract to replace
///       `token_client.balance(&voter)` with `token_client.staked_voting_power(&voter)`
/// - [ ] Write unit tests comparing raw balance vs staked voting power
#[allow(unused_variables)]
pub fn staked_voting_power(env: &Env, staker: Address) -> i128 {
    // TODO: load raw balance for staker
    // TODO: attempt to load StakeRecord for staker
    // TODO: if no stake record, return raw balance unchanged (1× multiplier)
    // TODO: compute lock_duration_days = record.lock_duration / SECONDS_PER_DAY
    // TODO: multiplier = voting_power_multiplier(lock_duration_days)
    // TODO: staked_power = record.amount * multiplier / MULTIPLIER_PRECISION
    // TODO: return staked_power + (raw_balance - record.amount)  [unstaked portion at 1×]
    todo!("staked_voting_power() not yet implemented — see ADR-013")
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// The multiplier at 0 days must be exactly 1× (MIN_MULTIPLIER).
    #[test]
    fn test_multiplier_at_zero_days() {
        assert_eq!(voting_power_multiplier(0), MIN_MULTIPLIER);
    }

    /// The multiplier at MAX_LOCK_DAYS must be exactly 4× (MAX_MULTIPLIER).
    #[test]
    fn test_multiplier_at_max_days() {
        assert_eq!(voting_power_multiplier(MAX_LOCK_DAYS), MAX_MULTIPLIER);
    }

    /// Locks exceeding MAX_LOCK_DAYS are clamped to 4×.
    #[test]
    fn test_multiplier_clamped_above_max() {
        assert_eq!(voting_power_multiplier(MAX_LOCK_DAYS + 1), MAX_MULTIPLIER);
        assert_eq!(voting_power_multiplier(u64::MAX), MAX_MULTIPLIER);
    }

    /// At 182 days (roughly half of 365) the multiplier should be close to
    /// 2.5× (25_000).  Allow ±1 rounding unit due to integer division.
    #[test]
    fn test_multiplier_midpoint() {
        let mid = voting_power_multiplier(182);
        // 182/365 * 30_000 + 10_000 ≈ 24_986
        assert!(
            (mid - 24_986_i128).abs() <= 2,
            "midpoint multiplier out of expected range: {mid}"
        );
    }

    /// Multiplier must be monotonically non-decreasing over [0, MAX_LOCK_DAYS].
    #[test]
    fn test_multiplier_monotonic() {
        let mut prev = voting_power_multiplier(0);
        for days in 1..=MAX_LOCK_DAYS {
            let cur = voting_power_multiplier(days);
            assert!(
                cur >= prev,
                "multiplier decreased at day {days}: {prev} -> {cur}"
            );
            prev = cur;
        }
    }
}
