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

//! Cross-contract integration tests (issue #86).
//!
//! Every test here deploys the real `votechain_token::TokenContract` alongside
//! the governance contract in the same `Env` — no mocked token client — so
//! bugs in the interaction between the two contracts surface here.

use crate::test_helpers::{create_test_proposal, setup_env, TestEnv};
use crate::types::{ContractError, Vote};
use soroban_sdk::{testutils::Address as _, Address};
use votechain_token::TokenContractClient;

fn token(t: &TestEnv) -> TokenContractClient<'static> {
    TokenContractClient::new(&t.env, &t.token_id)
}

/// Both contracts are deployed in the same Env and governance is wired to the
/// real token contract address.
#[test]
fn test_real_token_and_governance_deployed_in_same_env() {
    let t = setup_env();
    let tok = token(&t);

    assert_eq!(tok.total_supply(), 10_000_000);
    assert_eq!(tok.balance(&t.admin), 10_000_000);

    let voter = Address::generate(&t.env);
    tok.mint(&t.admin, &voter, &750);
    let pid = create_test_proposal(&t, &t.admin);
    t.client.cast_vote(&voter, &pid, &Vote::Yes, &None);

    assert!(t.client.has_voted(&pid, &voter));
}

/// Governance must record exactly the balance the real token contract reports.
#[test]
fn test_governance_reads_balance_from_real_token() {
    let t = setup_env();
    let tok = token(&t);
    let pid = create_test_proposal(&t, &t.admin);

    let alice = Address::generate(&t.env);
    let bob = Address::generate(&t.env);
    tok.mint(&t.admin, &alice, &1_234);
    tok.mint(&t.admin, &bob, &5_678);

    t.client.cast_vote(&alice, &pid, &Vote::Yes, &None);
    t.client.cast_vote(&bob, &pid, &Vote::No, &None);

    assert_eq!(t.client.get_vote(&pid, &alice).unwrap().weight, tok.balance(&alice));
    assert_eq!(t.client.get_vote(&pid, &bob).unwrap().weight, tok.balance(&bob));

    let p = t.client.get_proposal(&pid);
    assert_eq!(p.votes_yes, 1_234);
    assert_eq!(p.votes_no, 5_678);
    assert_eq!(p.votes_abstain, 0);
}

/// Moving tokens after voting must not change the already-recorded weight,
/// and the recipient's subsequent vote is weighted by its own live balance.
#[test]
fn test_balance_change_after_vote_does_not_change_recorded_weight() {
    let t = setup_env();
    let tok = token(&t);
    let pid = create_test_proposal(&t, &t.admin);

    let voter = Address::generate(&t.env);
    let other = Address::generate(&t.env);
    tok.mint(&t.admin, &voter, &1_000);
    t.client.cast_vote(&voter, &pid, &Vote::Yes, &None);

    // Drain the voter's balance through the real token contract.
    tok.transfer(&voter, &other, &1_000);
    assert_eq!(tok.balance(&voter), 0);
    assert_eq!(tok.balance(&other), 1_000);

    assert_eq!(t.client.get_vote(&pid, &voter).unwrap().weight, 1_000);
    assert_eq!(t.client.get_proposal(&pid).votes_yes, 1_000);

    // Minting more to the voter afterwards must not inflate the record either.
    tok.mint(&t.admin, &voter, &9_999);
    assert_eq!(t.client.get_vote(&pid, &voter).unwrap().weight, 1_000);
    assert_eq!(t.client.get_proposal(&pid).votes_yes, 1_000);
}

/// A voter whose real token balance is zero cannot vote.
#[test]
fn test_zero_real_token_balance_prevents_voting() {
    let t = setup_env();
    let pid = create_test_proposal(&t, &t.admin);
    let voter = Address::generate(&t.env);

    assert_eq!(token(&t).balance(&voter), 0);
    let res = t.client.try_cast_vote(&voter, &pid, &Vote::Yes, &None);
    assert_eq!(res, Err(Ok(ContractError::NoVotingPower)));
    assert!(!t.client.has_voted(&pid, &voter));
}

/// A voter who transfers away their whole balance before voting cannot vote.
#[test]
fn test_balance_transferred_away_before_vote_prevents_voting() {
    let t = setup_env();
    let tok = token(&t);
    let pid = create_test_proposal(&t, &t.admin);

    let voter = Address::generate(&t.env);
    let sink = Address::generate(&t.env);
    tok.mint(&t.admin, &voter, &500);
    tok.transfer(&voter, &sink, &500);

    let res = t.client.try_cast_vote(&voter, &pid, &Vote::No, &None);
    assert_eq!(res, Err(Ok(ContractError::NoVotingPower)));
    assert_eq!(t.client.get_proposal(&pid).votes_no, 0);
}
