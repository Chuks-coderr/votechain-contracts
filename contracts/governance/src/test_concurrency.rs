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

//! Concurrent double-vote race condition tests (issue #91).
//!
//! # Why a race is not possible
//!
//! `cast_vote` performs a read-check-write on the `has_voted` key:
//! it reads the flag, returns `AlreadyVoted` if set, otherwise tallies the
//! vote and sets the flag. In a system with truly parallel execution this
//! would be a classic TOCTOU race. Soroban prevents it because:
//!
//! 1. Every transaction declares its read/write footprint up front. Two
//!    transactions that both write the same `has_voted` ledger entry
//!    conflict and are never applied in parallel — they are serialised.
//! 2. Each contract invocation executes atomically: either all of its
//!    storage writes commit, or none do.
//! 3. The second of two serialised invocations therefore always observes the
//!    `has_voted` flag written by the first.
//!
//! "Parallel requests" submitted by a client (e.g. two RPC calls fired at the
//! same time, or two transactions in different XDR batches / ledgers) are
//! simply two transactions that the network orders. Whichever is applied
//! second fails with `AlreadyVoted`. The mitigation for any hypothetical
//! parallel-execution model is the footprint conflict rule above: because
//! both invocations write `DataKey::HasVoted(proposal_id, voter)`, they can
//! never land in the same parallel execution cluster.
//!
//! These tests model the two "concurrent" invocations as back-to-back calls,
//! optionally at the same ledger sequence/timestamp (same ledger close) and at
//! different sequences (different ledgers / XDR batches).

use crate::test_helpers::{create_test_proposal, setup_env};
use crate::types::{ContractError, Vote};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address,
};

fn mint(t: &crate::test_helpers::TestEnv, to: &Address, amount: i128) {
    let tok = votechain_token::TokenContractClient::new(&t.env, &t.token_id);
    tok.mint(&t.admin, to, &amount);
}

/// Two invocations applied in the same ledger (identical sequence number and
/// timestamp): exactly one succeeds, the other returns `AlreadyVoted`.
#[test]
fn test_concurrent_votes_same_ledger_exactly_one_succeeds() {
    let t = setup_env();
    let proposer = Address::generate(&t.env);
    let voter = Address::generate(&t.env);
    let id = create_test_proposal(&t, &proposer);
    mint(&t, &voter, 1_000);

    let seq = t.env.ledger().sequence();
    let ts = t.env.ledger().timestamp();

    // "Request A" and "Request B" — same voter, same proposal, same ledger.
    t.env.ledger().with_mut(|l| {
        l.sequence_number = seq + 1;
        l.timestamp = ts + 1;
    });
    let first = t.client.try_cast_vote(&voter, &id, &Vote::Yes, &None);
    let second = t.client.try_cast_vote(&voter, &id, &Vote::No, &None);

    let results = [first, second];
    let ok_count = results.iter().filter(|r| matches!(r, Ok(Ok(_)))).count();
    let already_voted = results
        .iter()
        .filter(|r| matches!(r, Err(Ok(ContractError::AlreadyVoted))))
        .count();

    assert_eq!(ok_count, 1, "exactly one concurrent vote must succeed");
    assert_eq!(already_voted, 1, "the other must fail with AlreadyVoted");

    // Only the first vote's weight was tallied.
    let p = t.client.get_proposal(&id);
    assert_eq!(p.votes_yes, 1_000);
    assert_eq!(p.votes_no, 0);
    assert!(t.client.has_voted(&id, &voter));
}

/// Two invocations submitted in different ledgers (e.g. different XDR
/// batches). The later one still observes the committed `has_voted` flag.
#[test]
fn test_concurrent_votes_different_ledgers_second_rejected() {
    let t = setup_env();
    let proposer = Address::generate(&t.env);
    let voter = Address::generate(&t.env);
    let id = create_test_proposal(&t, &proposer);
    mint(&t, &voter, 500);

    let seq = t.env.ledger().sequence();
    let ts = t.env.ledger().timestamp();

    t.env.ledger().with_mut(|l| {
        l.sequence_number = seq + 1;
        l.timestamp = ts + 5;
    });
    assert_eq!(t.client.try_cast_vote(&voter, &id, &Vote::No, &None), Ok(Ok(())));

    t.env.ledger().with_mut(|l| {
        l.sequence_number = seq + 2;
        l.timestamp = ts + 10;
    });
    assert_eq!(
        t.client.try_cast_vote(&voter, &id, &Vote::Yes, &None),
        Err(Ok(ContractError::AlreadyVoted))
    );

    let p = t.client.get_proposal(&id);
    assert_eq!(p.votes_no, 500);
    assert_eq!(p.votes_yes, 0);
}

/// A burst of many "parallel" requests from the same voter yields exactly one
/// success regardless of how many are submitted.
#[test]
fn test_burst_of_concurrent_votes_only_one_counted() {
    let t = setup_env();
    let proposer = Address::generate(&t.env);
    let voter = Address::generate(&t.env);
    let id = create_test_proposal(&t, &proposer);
    mint(&t, &voter, 250);

    let mut ok = 0;
    let mut rejected = 0;
    for _ in 0..10 {
        match t.client.try_cast_vote(&voter, &id, &Vote::Yes, &None) {
            Ok(Ok(())) => ok += 1,
            Err(Ok(ContractError::AlreadyVoted)) => rejected += 1,
            other => panic!("unexpected result: {other:?}"),
        }
    }

    assert_eq!(ok, 1);
    assert_eq!(rejected, 9);
    assert_eq!(t.client.get_proposal(&id).votes_yes, 250);
}
