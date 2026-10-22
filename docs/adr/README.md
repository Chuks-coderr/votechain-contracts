# Architecture Decision Records

This directory contains ADRs for VoteChain — records of significant architectural choices made during development.

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](ADR-001-stellar-soroban-platform.md) | Use Stellar Soroban as the smart contract platform | Accepted |
| [ADR-002](ADR-002-token-weighted-voting.md) | Token-weighted voting model | Accepted |
| [ADR-003](ADR-003-live-balance-over-snapshot.md) | Use live token balance instead of vote snapshots | Accepted |
| [ADR-004](ADR-004-three-way-vote.md) | Three-way vote: Yes / No / Abstain | Accepted |
| [ADR-005](ADR-005-on-chain-events.md) | Emit on-chain events for all state transitions | Accepted |
| [ADR-006](ADR-006-instance-vs-persistent-storage.md) | Instance vs persistent storage tier assignment | Accepted |
| [ADR-010](ADR-010-frontend-framework-vite-react.md) | Frontend framework: Vite + React + TypeScript | Accepted |
| [ADR-011](ADR-011-no-state-management-library.md) | No dedicated state management library (Context API) | Accepted |
| [ADR-012](ADR-012-freighter-sole-wallet.md) | Freighter as the sole wallet integration target | Accepted |
| [ADR-013](ADR-013-separate-indexer-service.md) | A separate indexer service (not querying Horizon directly from the API) | Accepted |
| [ADR-014](ADR-014-postgresql-storage-backend.md) | PostgreSQL as the indexer's storage backend | Accepted |
| [ADR-015](ADR-015-redis-caching-strategy.md) | Redis caching strategy (TTL-based + event-driven invalidation) | Accepted |
| [ADR-016](ADR-016-indexer-technology-postgresql-rust.md) | Indexer technology choice: PostgreSQL + Rust | Accepted |

To create a new ADR, copy [TEMPLATE.md](TEMPLATE.md), number it sequentially, and open a PR.

> Note: `ADR-007` and `ADR-001` each already have more than one file in this
> directory from earlier, independently-merged PRs
> (`ADR-007-delegation-design.md`, `ADR-007-multisig-admin.md`,
> `ADR-007-voting-power-snapshot.md`; `ADR-001-contract-upgrade-strategy.md`,
> `ADR-001-stellar-soroban-platform.md`). ADR-013/014/015 (this addition) use
> the next free numbers after the existing maximum (ADR-012) rather than the
> `ADR-007`/`ADR-008`/`ADR-009` numbers originally suggested in issue #77, to
> avoid adding a fourth collision on top of the existing ones. Renumbering the
> existing duplicates is out of scope here and left for a separate cleanup.
