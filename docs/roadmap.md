# VoteChain Roadmap

This public roadmap tracks the next product milestones for VoteChain and gives contributors a shared view of what is planned, what is intentionally deferred, and how roadmap updates are handled.

Review cadence: quarterly, or sooner when a major protocol, product, or security decision changes the plan.

Last reviewed: 2026-05-23
Next review target: 2026 Q3 planning

GitHub Milestones mirror this roadmap and link issues to releases. You can track live progress on the [GitHub Milestones page](https://github.com/veracindarella/votechain-contracts/milestones).

## Milestone 1: Stabilize Core Governance
<!-- GitHub Milestone: v1.0 MVP — https://github.com/veracindarella/votechain-contracts/milestone/1 -->

[![Milestone: v1.0 MVP](https://img.shields.io/github/milestones/progress/veracindarella/votechain-contracts/1)](https://github.com/veracindarella/votechain-contracts/milestone/1)

Timeline: current release line through the next minor release.

Goal: make the existing Soroban governance and token contracts dependable enough for repeatable testnet demos and external review.

### Deliverables

- Contract initialization, proposal creation, voting, finalization, execution, and cancellation remain covered by regression tests.
- Token-weighted voting, quorum checks, proposal cooldowns, and admin pause controls stay documented in the contract reference.
- Deployment scripts support local and testnet workflows with clearly documented environment variables.
- Security documentation covers known issues, audit scope, and the current threat model.
- Frontend proposal browsing and wallet vote-history views remain read-only-safe when contract addresses are not configured.

### Exit Criteria

- `make test`, `make lint`, and `make fmt-check` pass for contract changes.
- Testnet deployment instructions can be followed from a fresh checkout.
- Security docs are updated for any changed admin, voting, token, or storage behavior.

## Milestone 2: Delegation Support
<!-- GitHub Milestone: v1.1 Delegation — https://github.com/veracindarella/votechain-contracts/milestone/2 -->

[![Milestone: v1.1 Delegation](https://img.shields.io/github/milestones/progress/veracindarella/votechain-contracts/2)](https://github.com/veracindarella/votechain-contracts/milestone/2)

Timeline: one to two quarters after Milestone 1 is stable.

Goal: turn VoteChain from a contract-first repository into a usable governance toolkit for early DAO operators on Stellar.

### Deliverables

- Public testnet deployment with published governance and token contract IDs.
- Governance dashboard with proposal search, filtering, state labels, vote totals, and clear empty/error states.
- Proposal lifecycle guide linked from the README and frontend documentation.
- Indexer/API path for proposal and vote history so UIs do not rely only on direct contract reads.
- CSV export for proposal and vote history.
- Onboarding tutorial for first-time voters and DAO operators.

### Exit Criteria

- A new operator can create, vote on, finalize, and inspect a proposal on testnet using the documented flow.
- Frontend and indexer setup steps are reproducible without private maintainer context.
- Release notes call out contract IDs, compatibility notes, and known limitations.

## Milestone 3: SDK
<!-- GitHub Milestone: v1.2 SDK — https://github.com/veracindarella/votechain-contracts/milestone/3 -->

[![Milestone: v1.2 SDK](https://img.shields.io/github/milestones/progress/veracindarella/votechain-contracts/3)](https://github.com/veracindarella/votechain-contracts/milestone/3)

Timeline: post-v1.1, prioritized by user demand and partner integrations.

Goal: expand VoteChain into a modular governance system that can support more governance styles and ecosystem tooling.

### Deliverables

- Delegated voting and representative governance design.
- Multi-token governance support with configurable vote weighting.
- DAO treasury execution patterns for funding decisions.
- Proposal templates for common governance actions.
- Social sharing metadata for proposals.
- Integration guides for wallets, dashboards, and DAO tooling.

### Exit Criteria

- Each new governance module has an ADR or design note before implementation.
- Contract changes include migration or upgrade guidance.
- User-facing features include docs, tests, and a minimal operator workflow.

## Milestone 4: Multi-sig Admin
<!-- GitHub Milestone: v2.0 Multi-sig — https://github.com/veracindarella/votechain-contracts/milestone/4 -->

[![Milestone: v2.0 Multi-sig](https://img.shields.io/github/milestones/progress/veracindarella/votechain-contracts/4)](https://github.com/veracindarella/votechain-contracts/milestone/4)

Timeline: post-v1.2, major version milestone.

Goal: replace single-key admin authority with a multi-signature scheme to eliminate single points of failure in governance administration.

### Deliverables

- Multi-sig admin design documented in an ADR.
- On-chain multi-sig enforcement for admin operations (cancel, pause, execute).
- Migration guide from single-admin to multi-sig deployments.
- Updated security documentation covering the new threat model.

### Exit Criteria

- Multi-sig admin contract passes full test suite.
- Migration path documented and tested on testnet.
- Security docs updated.

## Maintenance Process

- Roadmap updates should be proposed through pull requests against `docs/roadmap.md`.
- Quarterly reviews should refresh milestone status, timelines, and exit criteria.
- Completed roadmap items should link to the PR, release, or documentation that shipped them.
- New roadmap items should include user value, affected components, and expected validation.
- Security-sensitive roadmap changes should also update `docs/security/threat-model.md` or `docs/security/known-issues.md` when relevant.
- GitHub Milestones are updated by maintainers to match this document. When a milestone ships, close it on GitHub and link the release here.

## Current Focus

The active focus is Milestone 1: contract reliability, testnet reproducibility, and clear documentation around the governance lifecycle. Work outside that focus can still be accepted when it is small, well-tested, and does not create migration pressure for the current contracts.
