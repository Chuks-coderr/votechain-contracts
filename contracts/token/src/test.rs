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

#![cfg(test)]
use super::*;
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events, Ledger},
    Address, Env, IntoVal, TryFromVal,
};

fn setup() -> (Env, TokenContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(TokenContract, ());
    (env.clone(), TokenContractClient::new(&env, &id))
}

#[test]
fn test_initialize() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    c.initialize(&admin, &1_000_000);
    assert_eq!(c.total_supply(), 1_000_000);
    assert_eq!(c.balance(&admin), 1_000_000);
}

#[test]
fn test_transfer() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    c.initialize(&admin, &1_000);
    c.transfer(&admin, &user, &400);
    assert_eq!(c.balance(&admin), 600);
    assert_eq!(c.balance(&user), 400);
}

#[test]
fn test_mint_burn() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    c.initialize(&admin, &1_000);
    c.mint(&admin, &user, &500);
    assert_eq!(c.total_supply(), 1_500);
    c.burn(&admin, &user, &200);
    assert_eq!(c.total_supply(), 1_300);
}

#[test]
#[should_panic]
fn test_overdraft() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    c.initialize(&admin, &100);
    c.transfer(&admin, &user, &999);
}

#[test]
#[should_panic]
fn test_mint_non_admin() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    c.initialize(&admin, &1_000);
    c.mint(&user, &user, &500);
}

#[test]
fn test_balance_of() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    c.initialize(&admin, &1_000);
    assert_eq!(c.balance(&admin), 1_000);
    assert_eq!(c.balance(&user1), 0);
    c.transfer(&admin, &user1, &300);
    assert_eq!(c.balance(&admin), 700);
    assert_eq!(c.balance(&user1), 300);
    assert_eq!(c.balance(&user2), 0);
}

#[test]
fn test_balance_of_named_function() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    c.initialize(&admin, &1_000);
    assert_eq!(c.balance_of(&admin), 1_000);
    assert_eq!(c.balance_of(&user), 0);
    c.transfer(&admin, &user, &400);
    assert_eq!(c.balance_of(&admin), 600);
    assert_eq!(c.balance_of(&user), 400);
}

#[test]
fn test_transfer_atomicity() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    c.initialize(&admin, &1_000);
    let before_total = c.total_supply();
    c.transfer(&admin, &user, &400);
    assert_eq!(c.balance(&admin) + c.balance(&user), before_total);
    assert_eq!(c.total_supply(), before_total);
}

#[test]
fn test_mint_increases_supply() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    c.initialize(&admin, &1_000);
    assert_eq!(c.total_supply(), 1_000);
    c.mint(&admin, &user, &500);
    assert_eq!(c.balance(&user), 500);
    assert_eq!(c.total_supply(), 1_500);
}

#[test]
fn test_events_mint() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    c.initialize(&admin, &0);
    c.mint(&admin, &user, &300);
    let events = env.events().all();
    assert!(events.iter().any(|(_, topics, data)| {
        topics == (symbol_short!("mint"), user.clone()).into_val(&env)
            && i128::try_from_val(&env, &data).ok() == Some(300_i128)
    }));
}

#[test]
fn test_events_transfer() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    c.initialize(&admin, &1_000);
    c.transfer(&admin, &user, &200);
    let events = env.events().all();
    assert!(events.iter().any(|(_, topics, data)| {
        topics == (symbol_short!("transfer"), admin.clone(), user.clone()).into_val(&env)
            && i128::try_from_val(&env, &data).ok() == Some(200_i128)
    }));
}

#[test]
fn test_events_burn() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    c.initialize(&admin, &1_000);
    c.burn(&admin, &admin, &400);
    let events = env.events().all();
    assert!(events.iter().any(|(_, topics, data)| {
        topics == (symbol_short!("burn"), admin.clone()).into_val(&env)
            && i128::try_from_val(&env, &data).ok() == Some(400_i128)
    }));
}

#[test]
fn test_transfer_to_self_is_noop() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    c.initialize(&admin, &1_000);
    // Transfer to self should succeed without changing balances.
    c.transfer(&admin, &admin, &400);
    assert_eq!(c.balance(&admin), 1_000);
    assert_eq!(c.total_supply(), 1_000);
    // No transfer event should be emitted for a self-transfer.
    let events = env.events().all();
    assert!(!events.iter().any(|(_, topics, _)| {
        topics == (symbol_short!("transfer"), admin.clone(), admin.clone()).into_val(&env)
    }));
}

#[test]
#[should_panic]
fn test_transfer_zero_amount() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    c.initialize(&admin, &1_000);
    // Zero amount must be rejected.
    c.transfer(&admin, &user, &0);
}

#[test]
#[should_panic]
fn test_transfer_negative_amount() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    c.initialize(&admin, &1_000);
    // Negative amount must be rejected.
    c.transfer(&admin, &user, &-1);
}

#[test]
#[should_panic]
fn test_initialize_zero_address_reverts() {
    let (env, c) = setup();
    let zero = Address::from_str(
        &env,
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );
    c.initialize(&zero, &1_000);
}

#[test]
fn test_get_version() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    c.initialize(&admin, &1_000);
    assert_eq!(c.get_version(), (1, 0, 0));
}

#[test]
fn test_approve_sets_allowance_and_allows_transfer_from() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);

    c.initialize(&admin, &1_000);
    // expiry_ledger = current + 1000 ledgers (well in the future)
    let expiry = env.ledger().sequence() + 1000;
    c.approve(&admin, &spender, &500, &expiry);

    // spender can transfer up to the approved amount
    c.transfer_from(&spender, &admin, &recipient, &200);
    assert_eq!(c.balance(&admin), 800);
    assert_eq!(c.balance(&recipient), 200);

    // remaining allowance (300) allows another transfer
    c.transfer_from(&spender, &admin, &recipient, &300);
    assert_eq!(c.balance(&admin), 500);
    assert_eq!(c.balance(&recipient), 500);
}

#[test]
#[should_panic]
fn test_transfer_from_insufficient_allowance() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);

    c.initialize(&admin, &1_000);
    let expiry = env.ledger().sequence() + 1000;
    c.approve(&admin, &spender, &100, &expiry);
    c.transfer_from(&spender, &admin, &recipient, &200);
}

#[test]
#[should_panic]
fn test_transfer_from_insufficient_balance() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);

    c.initialize(&admin, &100);
    let expiry = env.ledger().sequence() + 1000;
    c.approve(&admin, &spender, &500, &expiry);
    c.transfer_from(&spender, &admin, &recipient, &200);
}

#[test]
#[should_panic]
fn test_approve_zero_address_reverts() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let zero = Address::from_str(
        &env,
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );
    c.initialize(&admin, &1_000);
    let expiry = env.ledger().sequence() + 1000;
    c.approve(&admin, &zero, &100, &expiry);
}

/// #52: transfer_from on an expired allowance must return AllowanceExpired.
#[test]
#[should_panic]
fn test_transfer_from_expired_allowance_reverts() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);

    c.initialize(&admin, &1_000);
    // Approve with expiry at ledger 10.
    let current = env.ledger().sequence();
    c.approve(&admin, &spender, &500, &(current + 10));
    // Advance ledger past expiry.
    env.ledger().with_mut(|l| l.sequence_number += 20);
    // Must panic (AllowanceExpired).
    c.transfer_from(&spender, &admin, &recipient, &100);
}

/// #52: allowance() returns 0 after expiry.
#[test]
fn test_allowance_returns_zero_after_expiry() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);

    c.initialize(&admin, &1_000);
    let current = env.ledger().sequence();
    c.approve(&admin, &spender, &500, &(current + 5));
    // Within validity window — allowance should be 500.
    assert_eq!(c.allowance(&admin, &spender), 500);
    // Advance ledger past expiry.
    env.ledger().with_mut(|l| l.sequence_number += 10);
    // Must return 0 after expiry.
    assert_eq!(c.allowance(&admin, &spender), 0);
}

/// #52: approve with expiry_ledger < current sequence must revert.
#[test]
#[should_panic]
fn test_approve_past_expiry_reverts() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);

    c.initialize(&admin, &1_000);
    // Advance ledger first so sequence > 0, then try to set a past expiry.
    env.ledger().with_mut(|l| l.sequence_number = 100);
    c.approve(&admin, &spender, &500, &50_u32); // 50 < 100, must revert
}

/// #52: transfer_from within validity window succeeds.
#[test]
fn test_transfer_from_within_expiry_succeeds() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);

    c.initialize(&admin, &1_000);
    let current = env.ledger().sequence();
    c.approve(&admin, &spender, &500, &(current + 100));
    // Advance a few ledgers but stay within window.
    env.ledger().with_mut(|l| l.sequence_number += 50);
    c.transfer_from(&spender, &admin, &recipient, &200);
    assert_eq!(c.balance(&recipient), 200);
}

#[test]
fn test_transfer_event_emitted() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    c.initialize(&admin, &1_000);
    c.transfer(&admin, &user, &250);
    let events = env.events().all();
    assert!(events.iter().any(|(_, topics, data)| {
        topics == (symbol_short!("transfer"), admin.clone(), user.clone()).into_val(&env)
            && i128::try_from_val(&env, &data).ok() == Some(250_i128)
    }));
}

// ── SC-017: transfer_admin tests ──────────────────────────────────────────────

#[test]
fn test_transfer_admin_success() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    c.initialize(&admin, &1_000);
    c.transfer_admin(&admin, &new_admin);
    // new admin can now mint (proves privilege transfer)
    let user = Address::generate(&env);
    c.mint(&new_admin, &user, &500);
    assert_eq!(c.balance(&user), 500);
}

#[test]
fn test_transfer_admin_old_admin_loses_privileges() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    c.initialize(&admin, &1_000);
    c.transfer_admin(&admin, &new_admin);
    // new admin can now mint (proves privilege transfer)
    let user = Address::generate(&env);
    c.mint(&new_admin, &user, &500);
    assert_eq!(c.balance(&user), 500);
}

#[test]
#[should_panic]
fn test_transfer_admin_old_admin_cannot_mint() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    c.initialize(&admin, &1_000);
    c.transfer_admin(&admin, &new_admin);
    // old admin can no longer mint — must panic
    let user = Address::generate(&env);
    c.mint(&admin, &user, &100);
}

#[test]
#[should_panic]
fn test_transfer_admin_non_admin_reverts() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let non_admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    c.initialize(&admin, &1_000);
    c.transfer_admin(&non_admin, &new_admin);
}

#[test]
#[should_panic]
fn test_transfer_admin_zero_address_reverts() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    c.initialize(&admin, &1_000);
    let zero = Address::from_str(
        &env,
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );
    c.transfer_admin(&admin, &zero);
}

#[test]
fn test_transfer_admin_emits_event() {
    let (env, c) = setup();
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    c.initialize(&admin, &1_000);
    c.transfer_admin(&admin, &new_admin);
    let events = env.events().all();
    assert!(events.iter().any(|(_, topics, data)| {
        topics == (symbol_short!("admxfer"),).into_val(&env)
            && <(Address, Address)>::try_from_val(&env, &data)
                .ok()
                .as_ref()
                == Some(&(admin.clone(), new_admin.clone()))
    }));
}

// ── end SC-017 ────────────────────────────────────────────────────────────────
