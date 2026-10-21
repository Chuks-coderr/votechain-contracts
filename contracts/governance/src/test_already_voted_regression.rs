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

//! # Issue #295 – Regression tests for the `AlreadyVoted` error path
//!
//! `AlreadyVoted` (error code #10) is a critical vote-integrity guard.  These
//! tests ensure the double-vote path always returns the correct error and
//! emits the expected `vote_cast` event shape, covering all three first-vote
//! variants: Yes→Yes, No→Yes, Abstain→Yes.
//!
//! Each test triggers a snapshot save via the soroban test framework so that
//! any regression in the event structure will be caught by CI snapshot diffing.
//! Snapshots land in `test_snapshots/test/` automatically on first run.
//!
//! ## Acceptance criteria covered
//!
//! | Criterion                                              | Test                                            |
//! |--------------------------------------------------------|-------------------------------------------------|
//! | Yes→Yes double-vote attempt → `AlreadyVoted`          | `test_already_voted_yes_then_yes_rejected`      |
//! | No→Yes double-vote attempt → `AlreadyVoted`           | `test_already_voted_no_then_yes_rejected`       |
//! | Abstain→Yes double-vote attempt → `AlreadyVoted`      | `test_already_voted_abstain_then_yes_rejected`  |
//! | Event snapshot asserts rejection event shape          | `test_vote_cast_event_shape_for_regression`     |

#![cfg(test)]

use super::*;
use crate::test_helpers::{create_test_proposal, mint_and_vote, setup_env};
use crate::types::ContractError;
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events},
    Address, IntoVal,
};

// ─── helpers ──────────────────────────────────────────────────────────────────

/// Returns the number of `("vote", proposal_id)` events emitted so far.
///
/// Used to confirm exactly one event landed from the first cast and no
/// additional event appeared after a rejected double-vote attempt.
fn vote_event_count(env: &soroban_sdk::Env, proposal_id: u64) -> usize {
    env.events()
        .all()
        .iter()
        .filter(|(_, topics, _)| {
            topics == &(symbol_short!("vote"), proposal_id).into_val(env)
        })
        .count()
}

// ─── Yes → Yes double-vote ────────────────────────────────────────────────────

/// A voter who already voted Yes must not be able to vote Yes again.
///
/// Covers acceptance criterion: Yes→Yes double-vote attempt.
#[test]
fn test_already_voted_yes_then_yes_rejected() {
    let t = setup_env();
    let voter = Address::generate(&t.env);
    let proposal_id = create_test_proposal(&t, &voter);

    // First vote: Yes — must succeed and emit one event.
    mint_and_vote(&t, &voter, proposal_id, Vote::Yes, 1_000_000);
    assert!(t.client.has_voted(&proposal_id, &voter));
    assert_eq!(
        vote_event_count(&t.env, proposal_id),
        1,
        "expected exactly one vote event after the first cast"
    );

    // Second vote: Yes → must return AlreadyVoted.
    let result = t
        .client
        .try_cast_vote(&voter, &proposal_id, &Vote::Yes, &None);
    assert_eq!(
        result,
        Err(Ok(ContractError::AlreadyVoted)),
        "expected AlreadyVoted (#10) on Yes→Yes double-vote"
    );

    // No additional vote event must have been emitted.
    assert_eq!(
        vote_event_count(&t.env, proposal_id),
        1,
        "event count must not change after a rejected double-vote"
    );

    // Tally is unchanged.
    let p = t.client.get_proposal(&proposal_id);
    assert_eq!(p.votes_yes, 1_000_000);
    assert_eq!(p.votes_no, 0);
    assert_eq!(p.votes_abstain, 0);
}

// ─── No → Yes double-vote ─────────────────────────────────────────────────────

/// A voter who already voted No must not be able to switch to Yes.
///
/// Covers acceptance criterion: No→Yes double-vote attempt.
#[test]
fn test_already_voted_no_then_yes_rejected() {
    let t = setup_env();
    let voter = Address::generate(&t.env);
    let proposal_id = create_test_proposal(&t, &voter);

    // First vote: No.
    mint_and_vote(&t, &voter, proposal_id, Vote::No, 500_000);
    assert!(t.client.has_voted(&proposal_id, &voter));
    assert_eq!(vote_event_count(&t.env, proposal_id), 1);

    // Second vote: Yes → must return AlreadyVoted.
    let result = t
        .client
        .try_cast_vote(&voter, &proposal_id, &Vote::Yes, &None);
    assert_eq!(
        result,
        Err(Ok(ContractError::AlreadyVoted)),
        "expected AlreadyVoted (#10) on No→Yes double-vote"
    );

    // No extra event and tally unchanged.
    assert_eq!(vote_event_count(&t.env, proposal_id), 1);
    let p = t.client.get_proposal(&proposal_id);
    assert_eq!(p.votes_no, 500_000);
    assert_eq!(p.votes_yes, 0);
    assert_eq!(p.votes_abstain, 0);
}

// ─── Abstain → Yes double-vote ────────────────────────────────────────────────

/// A voter who already voted Abstain must not be able to switch to Yes.
///
/// Covers acceptance criterion: Abstain→Yes double-vote attempt.
#[test]
fn test_already_voted_abstain_then_yes_rejected() {
    let t = setup_env();
    let voter = Address::generate(&t.env);
    let proposal_id = create_test_proposal(&t, &voter);

    // First vote: Abstain.
    mint_and_vote(&t, &voter, proposal_id, Vote::Abstain, 750_000);
    assert!(t.client.has_voted(&proposal_id, &voter));
    assert_eq!(vote_event_count(&t.env, proposal_id), 1);

    // Second vote: Yes → must return AlreadyVoted.
    let result = t
        .client
        .try_cast_vote(&voter, &proposal_id, &Vote::Yes, &None);
    assert_eq!(
        result,
        Err(Ok(ContractError::AlreadyVoted)),
        "expected AlreadyVoted (#10) on Abstain→Yes double-vote"
    );

    // No extra event and tally unchanged.
    assert_eq!(vote_event_count(&t.env, proposal_id), 1);
    let p = t.client.get_proposal(&proposal_id);
    assert_eq!(p.votes_abstain, 750_000);
    assert_eq!(p.votes_yes, 0);
    assert_eq!(p.votes_no, 0);
}

// ─── vote event shape assertion ───────────────────────────────────────────────

/// The `vote_cast` event for a successful first vote must have topics
/// `("vote", proposal_id: u64)`.  This test triggers a snapshot save so CI
/// can detect any future change to the event structure.
///
/// Snapshot stored in: `test_snapshots/test/test_vote_cast_event_shape_for_regression.1.json`
#[test]
fn test_vote_cast_event_shape_for_regression() {
    let t = setup_env();
    let voter = Address::generate(&t.env);
    let proposal_id = create_test_proposal(&t, &voter);
    mint_and_vote(&t, &voter, proposal_id, Vote::Yes, 1_000_000);

    let events = t.env.events().all();
    let vote_events: soroban_sdk::Vec<_> = events
        .iter()
        .filter(|(_, topics, _)| {
            topics == &(symbol_short!("vote"), proposal_id).into_val(&t.env)
        })
        .collect();

    assert_eq!(
        vote_events.len(),
        1,
        "expected exactly one 'vote' event after a successful cast"
    );
}

// ─── multi-voter isolation ────────────────────────────────────────────────────

/// The AlreadyVoted guard is per-voter: voter A's vote must not prevent
/// voter B from voting on the same proposal.
#[test]
fn test_already_voted_is_per_voter_not_global() {
    let t = setup_env();
    let voter_a = Address::generate(&t.env);
    let voter_b = Address::generate(&t.env);
    let proposal_id = create_test_proposal(&t, &voter_a);

    // A votes; B has not yet voted.
    mint_and_vote(&t, &voter_a, proposal_id, Vote::Yes, 1_000_000);
    assert!(t.client.has_voted(&proposal_id, &voter_a));
    assert!(!t.client.has_voted(&proposal_id, &voter_b));

    // B can still vote without receiving AlreadyVoted.
    mint_and_vote(&t, &voter_b, proposal_id, Vote::No, 500_000);
    assert!(t.client.has_voted(&proposal_id, &voter_b));

    // Both tallies are correct.
    let p = t.client.get_proposal(&proposal_id);
    assert_eq!(p.votes_yes, 1_000_000);
    assert_eq!(p.votes_no, 500_000);
}
