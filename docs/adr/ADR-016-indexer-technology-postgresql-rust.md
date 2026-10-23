# ADR-016: Indexer Technology Choice — PostgreSQL + Rust

**Status:** Accepted
**Date:** 2026-10-20
**Issue:** [#277 — Write ADR for indexer technology choice (PostgreSQL + Rust)](https://github.com/veracindarella/votechain-contracts/issues/277)

## Context

ADR-013 established that VoteChain uses a separate indexer service (rather
than querying Horizon directly from the API layer), and ADR-014 selected
PostgreSQL as that indexer's storage backend. However, ADR-014 focuses on
the storage layer in isolation and does not consolidate the full technology
decision — the combination of **Rust** as the implementation language **and**
**PostgreSQL** as the data store — nor does it present the end-to-end
alternatives in one place.

This ADR consolidates the rationale for choosing Rust + PostgreSQL as the
indexer's technology stack, so a reader can understand the complete decision
and its trade-offs without jumping between ADR-013 and ADR-014.

The indexer must:

1. Poll Stellar Horizon's REST API on a timer and persist contract events.
2. Serve a small read API (`GET /events`, `GET /events/proposals/{id}`) from
   its own database — never calling Horizon in the request path.
3. Support filtered queries (by proposal, voter, topic, ledger range) and
   full-text search over proposal title/description.
4. Track an ingestion cursor per contract with strong consistency
   (the cursor only advances after a batch's inserts succeed).
5. Evolve its schema over time via forward-only SQL migrations.

## Decision

Implement the indexer as a single Rust binary using:

- **Rust** (stable toolchain, `tokio` async runtime) for the application
  logic — ingestion loop, Horizon client, and Axum REST API.
- **PostgreSQL 14+** for durable storage, accessed via `sqlx` with
  compile-time-checked queries and `sqlx::migrate!` for schema management.
- **JSONB** columns for the raw event payload so new contract event fields
  are captured without a schema migration; only fields that need indexing
  are promoted to real columns via migrations.

This combination was chosen because the indexer's workload is
**relational** (filter by scalar keys, uniqueness constraints for dedup,
full-text search) and **I/O-bound** (HTTP polling + database writes), which
plays to Rust's async I/O strengths and PostgreSQL's query capabilities.

## Consequences

### Positive

- **Type-safe database access.** `sqlx`'s compile-time query checking
  catches SQL errors before the binary ships, and Rust's type system
  prevents whole classes of runtime errors common in dynamically-typed
  indexer codebases.
- **Single-language ecosystem.** The indexer, the smart contracts, and
  the test utilities all use Rust, so contributors don't need to context
  switch between languages. Shared types (event enums, address types)
  can be reused via the workspace `Cargo.toml`.
- **Rich query support without a separate search service.** PostgreSQL's
  indexes and `websearch_to_tsquery` handle the indexer's filtering and
  full-text search needs directly — no Elasticsearch or similar dependency.
- **Operational maturity.** Both Rust and PostgreSQL are well-established
  with mature tooling (`cargo`, `pg_dump`, managed cloud offerings), making
  on-call and debugging straightforward for a small team.
- **Strong cursor consistency.** PostgreSQL's transactional semantics
  guarantee the ingestion cursor only advances after a batch's inserts
  commit, which a weakly-consistent store would make harder to reason about.

### Negative

- **Two stateful dependencies.** The indexer adds PostgreSQL on top of
  the backend's existing Redis dependency (ADR-015), increasing operational
  surface area (backups, monitoring, connection management).
- **Rust compile times.** The `sqlx` compile-time checking and the
  `tokio`/`axum` dependency tree make incremental builds slower than a
  Node.js or Go equivalent. Mitigated by `sccache` in CI and incremental
  compilation locally.
- **JSONB query ergonomics.** Querying into arbitrary payload fields
  requires JSONB operators or a migration to promote the field to a
  real column (as done for `voter_address` in migration
  `002_add_voter_index.sql`). This is a deliberate trade of schema
  flexibility for query convenience.
- **No native rollback for migrations.** `sqlx::migrate!` applies
  forward-only migrations; there is no automatic down-migration. A
  rollback path must be planned manually (see
  [`indexer/migrations/README.md`](../../indexer/migrations/README.md)).

## Alternatives Considered

### Storage alternatives

#### A. SQLite (embedded, no separate DB server)

Rejected for production: SQLite's single-writer model and lack of native
network access are a poor fit for a service that may run as multiple
replicas or need remote access from operational tooling. Reasonable for
local single-process development, but the indexer already supports local
development via a Dockerized Postgres instance, so maintaining two
schemas/dialects would add cost without benefit.

#### B. MongoDB (document store)

Rejected: the indexer's query patterns (filter by proposal ID, voter,
topic, ledger range; full-text search; uniqueness constraint for dedup)
are fundamentally relational, not document queries. A document store
would still need equivalent secondary indexes for these access patterns
without gaining anything the JSONB `payload` column doesn't already
provide for the schema-flexible part (the raw event body).

#### C. TimescaleDB (time-series extension on PostgreSQL)

Rejected as a *primary* choice: contract events are not a metrics /
time-series workload — the dominant queries are "all events for proposal
X" and "all votes by voter Y", not aggregations over time windows.
TimescaleDB is itself a PostgreSQL extension, so if time-bucketed
queries become a real need later, it can be adopted without a
storage-engine migration.

### Language alternatives

#### D. Node.js / TypeScript (same language as `backend/`)

Considered, since the backend service is already Node.js/TypeScript.
Rejected for the indexer: the ingestion loop is a long-running,
I/O-bound background task with CPU-bound event parsing and JSONB
serialization — a workload where Rust's zero-cost abstractions and
memory efficiency provide measurable benefits. Additionally, `sqlx`'s
compile-time SQL checking has no direct equivalent in the Node.js
ecosystem, and keeping the indexer in Rust allows sharing types with
the smart contract crate.

#### E. Go

Considered: Go has excellent concurrency primitives (goroutines,
channels) and a mature PostgreSQL driver (`pgx`). Rejected: Go lacks
the compile-time query checking of `sqlx`, its type system is less
expressive than Rust's (no sum types/enums for event topics without
code generation), and introducing a third language (Rust, TypeScript,
Go) into the monorepo increases tooling and contributor onboarding
cost for marginal benefit over Rust in this I/O-bound workload.

#### F. Python

Rejected: Python's GIL and dynamic typing are a poor fit for a
long-running ingestion service that needs predictable latency and
type safety around event parsing. The lack of compile-time checking
would push more errors to runtime, increasing operational risk for a
service expected to run continuously.

## Related ADRs

- [ADR-013](ADR-013-separate-indexer-service.md) — Decision to keep the
  indexer as a separate service rather than querying Horizon inline.
- [ADR-014](ADR-014-postgresql-storage-backend.md) — PostgreSQL as the
  storage backend (this ADR consolidates and extends that decision).
- [ADR-015](ADR-015-redis-caching-strategy.md) — Redis caching strategy
  for the `backend/` service that sits in front of the indexer.
