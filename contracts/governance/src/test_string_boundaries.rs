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

//! # Issue #298 – Boundary tests for proposal title and description lengths
//!
//! The governance contract enforces:
//!   - `title`:       1–128 bytes (inclusive)
//!   - `description`: 1–1024 bytes (inclusive)
//!
//! These tests exercise the exact boundary values and the first-out-of-range
//! values for both fields, providing storage-size estimate confidence.
//!
//! ## Acceptance criteria covered
//!
//! | # | Criterion                                              | Test                                           |
//! |---|--------------------------------------------------------|------------------------------------------------|
//! | 1 | 128-char title → succeeds                             | `test_title_exact_max_length_accepted`         |
//! | 2 | 129-char title → returns `InvalidTitle`               | `test_title_one_over_max_length_rejected`      |
//! | 3 | 1024-char description → succeeds                      | `test_description_exact_max_length_accepted`   |
//! | 4 | 1025-char description → returns `InvalidDescription`  | `test_description_one_over_max_length_rejected`|

#![cfg(test)]

use super::*;
use crate::test_helpers::setup_env;
use crate::types::ContractError;
use soroban_sdk::{testutils::Address as _, Address, String};

// ─── title boundary tests ──────────────────────────────────────────────────────

/// A title of exactly 128 printable ASCII bytes must be accepted.
///
/// Verifies acceptance criterion 1 of issue #298.
#[test]
fn test_title_exact_max_length_accepted() {
    let t = setup_env();
    let proposer = Address::generate(&t.env);
    let title_128 = "A".repeat(128);
    let id = t.client.create_proposal(
        &proposer,
        &String::from_str(&t.env, &title_128),
        &String::from_str(&t.env, "Valid description"),
        &100,
        &3600,
    );
    let proposal = t.client.get_proposal(&id);
    assert_eq!(proposal.state, ProposalState::Active);
    // Confirm the stored title byte length is exactly 128.
    assert_eq!(proposal.title.len(), 128);
}

/// A title of 129 bytes must be rejected with `InvalidTitle` (error #19).
///
/// Verifies acceptance criterion 2 of issue #298.
#[test]
fn test_title_one_over_max_length_rejected() {
    let t = setup_env();
    let proposer = Address::generate(&t.env);
    let title_129 = "A".repeat(129);
    let result = t.client.try_create_proposal(
        &proposer,
        &String::from_str(&t.env, &title_129),
        &String::from_str(&t.env, "Valid description"),
        &100,
        &3600,
    );
    assert_eq!(
        result,
        Err(Ok(ContractError::InvalidTitle)),
        "expected InvalidTitle (#19) for a 129-byte title"
    );
}

/// A title of exactly 1 byte must be accepted (lower boundary).
#[test]
fn test_title_min_length_accepted() {
    let t = setup_env();
    let proposer = Address::generate(&t.env);
    let id = t.client.create_proposal(
        &proposer,
        &String::from_str(&t.env, "A"),
        &String::from_str(&t.env, "Valid description"),
        &100,
        &3600,
    );
    assert_eq!(t.client.get_proposal(&id).state, ProposalState::Active);
}

/// An empty title must be rejected with `InvalidTitle` (error #19).
#[test]
fn test_title_empty_rejected() {
    let t = setup_env();
    let proposer = Address::generate(&t.env);
    let result = t.client.try_create_proposal(
        &proposer,
        &String::from_str(&t.env, ""),
        &String::from_str(&t.env, "Valid description"),
        &100,
        &3600,
    );
    assert_eq!(
        result,
        Err(Ok(ContractError::InvalidTitle)),
        "expected InvalidTitle (#19) for an empty title"
    );
}

// ─── description boundary tests ───────────────────────────────────────────────

/// A description of exactly 1024 printable ASCII bytes must be accepted.
///
/// Verifies acceptance criterion 3 of issue #298.
#[test]
fn test_description_exact_max_length_accepted() {
    let t = setup_env();
    let proposer = Address::generate(&t.env);
    let desc_1024 = "B".repeat(1024);
    let id = t.client.create_proposal(
        &proposer,
        &String::from_str(&t.env, "Valid title"),
        &String::from_str(&t.env, &desc_1024),
        &100,
        &3600,
    );
    let proposal = t.client.get_proposal(&id);
    assert_eq!(proposal.state, ProposalState::Active);
    // Confirm the stored description byte length is exactly 1024.
    assert_eq!(proposal.description.len(), 1024);
}

/// A description of 1025 bytes must be rejected with `InvalidDescription` (error #20).
///
/// Verifies acceptance criterion 4 of issue #298.
#[test]
fn test_description_one_over_max_length_rejected() {
    let t = setup_env();
    let proposer = Address::generate(&t.env);
    let desc_1025 = "B".repeat(1025);
    let result = t.client.try_create_proposal(
        &proposer,
        &String::from_str(&t.env, "Valid title"),
        &String::from_str(&t.env, &desc_1025),
        &100,
        &3600,
    );
    assert_eq!(
        result,
        Err(Ok(ContractError::InvalidDescription)),
        "expected InvalidDescription (#20) for a 1025-byte description"
    );
}

/// A description of exactly 1 byte must be accepted (lower boundary).
#[test]
fn test_description_min_length_accepted() {
    let t = setup_env();
    let proposer = Address::generate(&t.env);
    let id = t.client.create_proposal(
        &proposer,
        &String::from_str(&t.env, "Valid title"),
        &String::from_str(&t.env, "X"),
        &100,
        &3600,
    );
    assert_eq!(t.client.get_proposal(&id).state, ProposalState::Active);
}

/// An empty description must be rejected with `InvalidDescription` (error #20).
#[test]
fn test_description_empty_rejected() {
    let t = setup_env();
    let proposer = Address::generate(&t.env);
    let result = t.client.try_create_proposal(
        &proposer,
        &String::from_str(&t.env, "Valid title"),
        &String::from_str(&t.env, ""),
        &100,
        &3600,
    );
    assert_eq!(
        result,
        Err(Ok(ContractError::InvalidDescription)),
        "expected InvalidDescription (#20) for an empty description"
    );
}

// ─── combined boundary test ────────────────────────────────────────────────────

/// Both title and description at exact maximum length must be accepted together.
///
/// This is the storage-estimation case: a fully-saturated proposal.
#[test]
fn test_max_title_and_max_description_accepted_together() {
    let t = setup_env();
    let proposer = Address::generate(&t.env);
    let title_128 = "T".repeat(128);
    let desc_1024 = "D".repeat(1024);
    let id = t.client.create_proposal(
        &proposer,
        &String::from_str(&t.env, &title_128),
        &String::from_str(&t.env, &desc_1024),
        &100,
        &3600,
    );
    let proposal = t.client.get_proposal(&id);
    assert_eq!(proposal.state, ProposalState::Active);
    assert_eq!(proposal.title.len(), 128);
    assert_eq!(proposal.description.len(), 1024);
}
