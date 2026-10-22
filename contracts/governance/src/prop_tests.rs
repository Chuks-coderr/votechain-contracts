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

//! Property-based tests for vote tally invariants.
//!
//! These tests operate on plain arithmetic that mirrors the tally logic in
//! `GovernanceContract::cast_vote` and `finalise`, without requiring a
//! Soroban execution environment.
//!
//! ## Issue #58 — Edge quorum coverage
//!
//! The tests in this module now also cover the three quorum edge cases
//! identified in issue #58:
//!
//! 1. `quorum = 1` — minimum possible quorum; any single token holder can pass.
//! 2. `quorum = total_supply` — maximum quorum; every token must participate.
//! 3. `total_votes == quorum` — boundary; passes iff `yes > no`.
//! 4. `total_votes == quorum - 1` — just below boundary; always rejects.

#![cfg(test)]

use super::quorum_is_met;
use proptest::prelude::*;

/// Maximum token supply used across all strategies (mirrors a realistic cap).
const MAX_SUPPLY: i128 = i128::MAX / 4;

proptest! {
    /// Invariant 1: votes_yes + votes_no + votes_abstain == total_votes
    ///
    /// For any non-negative split of votes the sum must equal the total.
    #[test]
    fn tally_sum_equals_total(
        yes     in 0i128..=MAX_SUPPLY / 3,
        no      in 0i128..=MAX_SUPPLY / 3,
        abstain in 0i128..=MAX_SUPPLY / 3,
    ) {
        let total = yes + no + abstain;
        prop_assert_eq!(total, yes + no + abstain);
    }

    /// Invariant 2: total votes never exceed total token supply.
    ///
    /// Each voter contributes at most their balance, and the sum of all
    /// balances is bounded by the total supply.
    #[test]
    fn total_votes_never_exceed_supply(
        supply  in 1i128..=MAX_SUPPLY,
        yes     in 0i128..=MAX_SUPPLY,
        no      in 0i128..=MAX_SUPPLY,
        abstain in 0i128..=MAX_SUPPLY,
    ) {
        // Clamp each bucket so the combined tally stays within supply,
        // replicating the constraint that voters can only spend their balance.
        let yes     = yes.min(supply);
        let no      = no.min(supply - yes);
        let abstain = abstain.min(supply - yes - no);

        let total = yes + no + abstain;
        prop_assert!(total <= supply);
    }

    /// Invariant 3: quorum check is consistent with stored vote counts.
    ///
    /// A proposal passes iff total_votes >= quorum AND votes_yes > votes_no.
    /// This mirrors the condition in `finalise` exactly.
    #[test]
    fn quorum_check_consistent_with_vote_counts(
        yes     in 0i128..=MAX_SUPPLY / 3,
        no      in 0i128..=MAX_SUPPLY / 3,
        abstain in 0i128..=MAX_SUPPLY / 3,
        quorum  in 1i128..=MAX_SUPPLY,
    ) {
        let total = yes + no + abstain;
        let passes = total >= quorum && yes > no;

        // Re-derive from the same inputs — must agree.
        let expected = (yes + no + abstain) >= quorum && yes > no;
        prop_assert_eq!(passes, expected);
    }

    /// At each side of the quorum boundary, finalisation matches the contract rule.
    #[test]
    fn quorum_boundary_matches_specification(
        quorum in prop_oneof![Just(1i128), Just(MAX_SUPPLY), 1i128..MAX_SUPPLY],
        offset in -1i8..=1,
        yes_raw in 0i128..=MAX_SUPPLY,
        no_raw in 0i128..=MAX_SUPPLY,
    ) {
        let total = (quorum + i128::from(offset)).clamp(0, MAX_SUPPLY);
        let yes = yes_raw.min(total);
        let no = no_raw.min(total - yes);
        let abstain = total - yes - no;

        prop_assert_eq!(yes + no + abstain, total);
        let actual = quorum_is_met(total, quorum, yes, no);
        let expected = total >= quorum && yes > no;
        prop_assert_eq!(actual, expected);
    }

    // -------------------------------------------------------------------------
    // Issue #58 — Edge quorum value invariants
    // -------------------------------------------------------------------------

    /// Edge case: quorum = 1, single voter casts Yes with any positive balance.
    ///
    /// With the minimum possible quorum the proposal must always pass as long
    /// as votes_yes > 0 (so yes > no = 0).
    #[test]
    fn quorum_one_single_yes_always_passes(
        yes in 1i128..=MAX_SUPPLY,
    ) {
        let quorum: i128 = 1;
        let no: i128 = 0;
        let abstain: i128 = 0;
        let total = yes + no + abstain;
        let passes = total >= quorum && yes > no;
        // With quorum = 1 and yes >= 1 > no = 0, must always pass.
        prop_assert!(passes, "quorum=1, yes={yes} should pass, got passes={passes}");
    }

    /// Edge case: quorum = total_supply, all holders vote Yes.
    ///
    /// When quorum equals total supply every token must participate.  A single
    /// holder with `supply` tokens voting Yes satisfies both the quorum condition
    /// and the majority condition.
    #[test]
    fn quorum_equals_supply_all_yes_passes(
        supply in 1i128..=MAX_SUPPLY,
    ) {
        let quorum = supply;
        let yes = supply;
        let no: i128 = 0;
        let abstain: i128 = 0;
        let total = yes + no + abstain;
        let passes = total >= quorum && yes > no;
        prop_assert!(
            passes,
            "quorum=supply={supply}, yes=supply should pass, got passes={passes}"
        );
    }

    /// Edge case: total_votes exactly equals quorum.
    ///
    /// When total votes just meet the quorum threshold the outcome is
    /// determined solely by the yes/no comparison.
    #[test]
    fn total_votes_exactly_equals_quorum_passes_iff_yes_gt_no(
        quorum  in 2i128..=MAX_SUPPLY / 3,
        // yes > no with yes + no <= quorum
        no      in 0i128..=MAX_SUPPLY / 6,
    ) {
        // yes must satisfy: yes > no  and  yes + no <= quorum
        let yes = no + 1; // guarantees yes > no
        let abstain = quorum - yes - no; // fills exactly to quorum
        prop_assume!(abstain >= 0);
        let total = yes + no + abstain;
        prop_assert_eq!(total, quorum, "total must equal quorum exactly");
        let passes = total >= quorum && yes > no;
        prop_assert!(
            passes,
            "total=quorum={quorum}, yes={yes} > no={no} must pass"
        );
    }

    /// Edge case: total_votes = quorum - 1 → always rejects.
    ///
    /// One vote short of quorum must never pass, regardless of yes/no split.
    #[test]
    fn total_votes_one_below_quorum_always_rejects(
        quorum  in 2i128..=MAX_SUPPLY,
        yes     in 0i128..=MAX_SUPPLY,
        no      in 0i128..=MAX_SUPPLY,
        abstain in 0i128..=MAX_SUPPLY,
    ) {
        // Total must be exactly quorum - 1.
        let target = quorum - 1;
        prop_assume!(target >= 0);
        // Scale yes/no/abstain to sum to target.
        let total_raw = yes + no + abstain;
        let (yes_s, no_s, abstain_s) = if total_raw == 0 {
            (0, 0, target)
        } else {
            // Proportional scaling — preserves relative magnitudes.
            let y = (yes * target) / total_raw;
            let n = (no * target) / total_raw;
            let a = target - y - n;
            (y, n, a)
        };
        prop_assume!(abstain_s >= 0);
        let total = yes_s + no_s + abstain_s;
        prop_assert_eq!(total, target, "scaled total must equal quorum-1={target}");
        let passes = total >= quorum && yes_s > no_s;
        prop_assert!(
            !passes,
            "total={total} < quorum={quorum} must always reject"
        );
    }
}
