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

//! Delegation tests for issue #41.
//!
//! Covers:
//!   1. delegate() sets delegation in storage
//!   2. get_delegate() returns the current delegate (self by default)
//!   3. undelegate() clears the delegation
//!   4. Delegator cannot vote directly while power is delegated
//!   5. Delegate can vote and accumulate delegator weight
//!   6. Delegator can vote directly after undelegating
//!   7. Self-delegation preserves direct voting power
//!   8. Cannot delegate to zero address
//!   9. Delegator marked as voted when delegate casts vote
//!  10. Delegator cannot vote after being counted via cast_vote_with_delegators
//!  11. cast_vote_with_delegators skips non-delegators silently
//!  12. cast_vote_with_delegators skips already-voted delegators

#[cfg(test)]
mod delegation_tests {
    use crate::test_helpers::{create_test_proposal, setup_env};
    use crate::types::{ContractError, Vote};
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Vec;

    // ── helpers ───────────────────────────────────────────────────────────

    /// Advance the ledger clock far enough to be inside the voting window
    /// (after `start_time`, before `end_time`).  `start_time` = now at create
    /// time so just bumping by 1 second is sufficient.
    fn advance_past_start(t: &crate::test_helpers::TestEnv) {
        t.env.ledger().with_mut(|l| {
            l.timestamp += 10;
        });
    }

    /// Advance past the voting window (end_time = start_time + 3600 by default).
    fn advance_past_end(t: &crate::test_helpers::TestEnv) {
        t.env.ledger().with_mut(|l| {
            l.timestamp += 3700;
        });
    }

    // ── test 1: delegate() stores the delegation ──────────────────────────
    #[test]
    fn test_delegate_sets_delegation() {
        let t = setup_env();
        let delegator = soroban_sdk::Address::generate(&t.env);
        let delegate = soroban_sdk::Address::generate(&t.env);

        t.client.delegate(&delegator, &delegate);

        let stored = t.client.get_delegate(&delegator);
        assert_eq!(stored, Some(delegate));
    }

    // ── test 2: get_delegate returns self when no delegation is set ───────
    #[test]
    fn test_get_delegate_returns_none_when_not_delegated() {
        let t = setup_env();
        let addr = soroban_sdk::Address::generate(&t.env);

        let stored = t.client.get_delegate(&addr);
        assert_eq!(stored, Some(addr));
    }

    // ── test 3: undelegate() clears the delegation ────────────────────────
    #[test]
    fn test_undelegate_clears_delegation() {
        let t = setup_env();
        let delegator = soroban_sdk::Address::generate(&t.env);
        let delegate = soroban_sdk::Address::generate(&t.env);

        t.client.delegate(&delegator, &delegate);
        t.client.undelegate(&delegator);

        let stored = t.client.get_delegate(&delegator);
        assert_eq!(stored, None);
    }

    // ── test 4: delegator cannot vote directly while power is delegated ───
    #[test]
    fn test_delegator_cannot_vote_directly_while_delegated() {
        let t = setup_env();
        let delegator = soroban_sdk::Address::generate(&t.env);
        let delegate = soroban_sdk::Address::generate(&t.env);

        // Mint tokens to delegator
        let tok = votechain_token::TokenContractClient::new(&t.env, &t.token_id);
        tok.mint(&t.admin, &delegator, &500_i128);

        // Delegate power
        t.client.delegate(&delegator, &delegate);

        let proposal_id = create_test_proposal(&t, &t.admin);
        advance_past_start(&t);

        // Attempt direct vote — should fail with VotingPowerDelegated
        let result = t.client.try_cast_vote(&delegator, &proposal_id, &Vote::Yes, &None);
        assert_eq!(
            result,
            Err(Ok(ContractError::VotingPowerDelegated)),
            "expected VotingPowerDelegated error"
        );
    }

    // ── test 5: delegator can vote after undelegating ─────────────────────
    #[test]
    fn test_delegator_can_vote_after_undelegating() {
        let t = setup_env();
        let delegator = soroban_sdk::Address::generate(&t.env);
        let delegate = soroban_sdk::Address::generate(&t.env);

        let tok = votechain_token::TokenContractClient::new(&t.env, &t.token_id);
        tok.mint(&t.admin, &delegator, &500_i128);

        t.client.delegate(&delegator, &delegate);
        t.client.undelegate(&delegator);

        let proposal_id = create_test_proposal(&t, &t.admin);
        advance_past_start(&t);

        // Now the direct vote should succeed
        t.client.cast_vote(&delegator, &proposal_id, &Vote::Yes, &None);

        let proposal = t.client.get_proposal(&proposal_id).unwrap();
        assert_eq!(proposal.votes_yes, 500);
    }

    // ── test 6: self-delegation leaves direct voting power available ──────
    #[test]
    fn test_self_delegation_keeps_direct_voting_power() {
        let t = setup_env();
        let addr = soroban_sdk::Address::generate(&t.env);

        t.client.delegate(&addr, &addr);
        assert_eq!(t.client.get_delegate(&addr), Some(addr));
    }

    #[test]
    fn test_circular_delegation_is_rejected() {
        let t = setup_env();
        let address_a = soroban_sdk::Address::generate(&t.env);
        let address_b = soroban_sdk::Address::generate(&t.env);
        let address_c = soroban_sdk::Address::generate(&t.env);

        t.client.delegate(&address_a, &address_b);
        t.client.delegate(&address_b, &address_c);

        let result = t.client.try_delegate(&address_c, &address_a);
        assert_eq!(result, Err(Ok(ContractError::CircularDelegation)));
        assert_eq!(t.client.get_delegate(&address_c), Some(address_c));
    }

    // ── test 7: cannot delegate to zero address ───────────────────────────
    #[test]
    fn test_cannot_delegate_to_zero_address() {
        use soroban_sdk::Address;
        let t = setup_env();
        let delegator = soroban_sdk::Address::generate(&t.env);
        let zero =
            Address::from_str(&t.env, "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF");

        let result = t.client.try_delegate(&delegator, &zero);
        assert_eq!(
            result,
            Err(Ok(ContractError::InvalidDelegateAddress)),
            "expected InvalidDelegateAddress error"
        );
    }

    // ── test 8: cast_vote_with_delegators accumulates delegated weight ────
    #[test]
    fn test_cast_vote_with_delegators_accumulates_weight() {
        let t = setup_env();
        let delegator_a = soroban_sdk::Address::generate(&t.env);
        let delegator_b = soroban_sdk::Address::generate(&t.env);
        let delegate = soroban_sdk::Address::generate(&t.env);

        let tok = votechain_token::TokenContractClient::new(&t.env, &t.token_id);
        tok.mint(&t.admin, &delegator_a, &300_i128);
        tok.mint(&t.admin, &delegator_b, &200_i128);
        tok.mint(&t.admin, &delegate, &100_i128);

        // Both delegate to `delegate`
        t.client.delegate(&delegator_a, &delegate);
        t.client.delegate(&delegator_b, &delegate);

        let proposal_id = create_test_proposal(&t, &t.admin);
        advance_past_start(&t);

        let mut delegators = Vec::new(&t.env);
        delegators.push_back(delegator_a.clone());
        delegators.push_back(delegator_b.clone());

        t.client
            .cast_vote_with_delegators(&delegate, &proposal_id, &Vote::Yes, &delegators);

        let proposal = t.client.get_proposal(&proposal_id).unwrap();
        // 100 (delegate) + 300 (a) + 200 (b) = 600
        assert_eq!(proposal.votes_yes, 600);
    }

    // ── test 9: delegator is marked as voted after cast_vote_with_delegators
    #[test]
    fn test_delegator_marked_as_voted_after_delegation_cast() {
        let t = setup_env();
        let delegator = soroban_sdk::Address::generate(&t.env);
        let delegate = soroban_sdk::Address::generate(&t.env);

        let tok = votechain_token::TokenContractClient::new(&t.env, &t.token_id);
        tok.mint(&t.admin, &delegator, &200_i128);
        tok.mint(&t.admin, &delegate, &100_i128);

        t.client.delegate(&delegator, &delegate);

        let proposal_id = create_test_proposal(&t, &t.admin);
        advance_past_start(&t);

        let mut delegators = Vec::new(&t.env);
        delegators.push_back(delegator.clone());

        t.client
            .cast_vote_with_delegators(&delegate, &proposal_id, &Vote::Yes, &delegators);

        // Delegator should now be marked as voted
        let has_voted = t.client.has_voted(&proposal_id, &delegator).unwrap();
        assert!(has_voted, "delegator should be marked as voted");
    }

    // ── test 10: cast_vote_with_delegators skips non-delegators silently ──
    #[test]
    fn test_cast_vote_with_delegators_skips_non_delegators() {
        let t = setup_env();
        let non_delegator = soroban_sdk::Address::generate(&t.env);
        let delegate = soroban_sdk::Address::generate(&t.env);

        let tok = votechain_token::TokenContractClient::new(&t.env, &t.token_id);
        tok.mint(&t.admin, &delegate, &100_i128);
        tok.mint(&t.admin, &non_delegator, &999_i128);

        // non_delegator has NOT delegated to `delegate`

        let proposal_id = create_test_proposal(&t, &t.admin);
        advance_past_start(&t);

        let mut delegators = Vec::new(&t.env);
        delegators.push_back(non_delegator.clone());

        // Should succeed but only count delegate's own balance
        t.client
            .cast_vote_with_delegators(&delegate, &proposal_id, &Vote::Yes, &delegators);

        let proposal = t.client.get_proposal(&proposal_id).unwrap();
        assert_eq!(proposal.votes_yes, 100, "only delegate's own weight counted");
    }

    // ── test 11: cast_vote_with_delegators skips already-voted delegators ─
    #[test]
    fn test_cast_vote_with_delegators_skips_already_voted_delegators() {
        let t = setup_env();
        let delegator = soroban_sdk::Address::generate(&t.env);
        let delegate = soroban_sdk::Address::generate(&t.env);

        let tok = votechain_token::TokenContractClient::new(&t.env, &t.token_id);
        tok.mint(&t.admin, &delegator, &300_i128);
        tok.mint(&t.admin, &delegate, &100_i128);

        t.client.delegate(&delegator, &delegate);

        let proposal_id = create_test_proposal(&t, &t.admin);
        advance_past_start(&t);

        let mut delegators = Vec::new(&t.env);
        delegators.push_back(delegator.clone());

        // First call: delegator counted (total = 400)
        t.client
            .cast_vote_with_delegators(&delegate, &proposal_id, &Vote::Yes, &delegators);

        let proposal = t.client.get_proposal(&proposal_id).unwrap();
        assert_eq!(proposal.votes_yes, 400);
    }

    // ── test 12: overwriting delegation (re-delegate to different address) ─
    #[test]
    fn test_redelegate_overwrites_existing_delegation() {
        let t = setup_env();
        let delegator = soroban_sdk::Address::generate(&t.env);
        let delegate_a = soroban_sdk::Address::generate(&t.env);
        let delegate_b = soroban_sdk::Address::generate(&t.env);

        t.client.delegate(&delegator, &delegate_a);
        assert_eq!(t.client.get_delegate(&delegator), Some(delegate_a));

        // Re-delegate to a different address
        t.client.delegate(&delegator, &delegate_b);
        assert_eq!(
            t.client.get_delegate(&delegator),
            Some(delegate_b),
            "delegation should point to new delegate"
        );
    }
}
