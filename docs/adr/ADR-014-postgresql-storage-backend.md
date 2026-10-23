# ADR-014: PostgreSQL as the Indexer's Storage Backend

**Status:** Accepted
**Date:** 2026-09-29
**Issue:** [#77 — Write ADR for indexer and API architecture choices](https://github.com/veracindarella/votechain-contracts/issues/77)

## Context

The indexer (ADR-013) needs a durable store for two things:

1. **Ingestion progress** — `indexer_cursor(contract_id, last_ledger)`, a
   tiny, frequently-updated table.
2. **Contract events** — `contract_events`, an append-mostly table of
   structured rows (`ledger_seq`, `tx_hash`, `contract_id`, `topic`,
   `proposal_id`, `payload` JSONB, `ingested_at`) that the REST API queries
   with filters (by proposal, by voter, by topic) and, per migration
   `003_add_proposal_search.sql`, full-text search over proposal
   title/description.

The store needs to support: efficient equality/range filtering
(`WHERE proposal_id = $1 ORDER BY ledger_seq`), a uniqueness constraint for
de-duplicating re-delivered events (migration `003_dedupe_events.sql`), and
schema evolution over time via forward-only migrations (see
[`indexer/migrations/README.md`](../../indexer/migrations/README.md)).

## Decision

Use PostgreSQL, accessed via `sqlx` with compile-time-checked queries and
`sqlx::migrate!` for schema management (`indexer/Cargo.toml`,
`indexer/src/main.rs`). Concretely:

- Relational tables with explicit indexes (`idx_events_contract`,
  `idx_events_topic`, `idx_events_proposal`, `idx_events_ledger`,
  `idx_events_voter`, the composite `idx_events_proposal_ledger`, and the
  GIN `proposals_search_idx` for full-text search).
- A `JSONB` column (`payload`) for the raw event body, so new event fields
  emitted by the contract don't require a schema migration to capture —
  only queries that need to *filter or index* on a new field do.
- A unique index (`uq_events_dedupe`) on
  `(contract_id, ledger_seq, tx_hash, topic, md5(payload::text))` so
  `INSERT ... ON CONFLICT DO NOTHING` correctly no-ops on re-delivered
  events instead of silently failing to dedupe (the bug fixed by migration
  `003_dedupe_events.sql`).

## Consequences

- **Rich, ad-hoc query support out of the box.** Filtering by proposal ID,
  voter address, topic, or ledger range, plus full-text search
  (`websearch_to_tsquery` over the generated `search_vector` column), are
  all expressed as plain SQL with index support — no separate search
  service or query-translation layer needed.
- **Strong consistency for the cursor.** `indexer_cursor` updates are
  transactional relative to the event inserts they gate (the cursor only
  advances after a batch's inserts succeed — see
  [`indexer/README.md`](../../indexer/README.md#the-cursor-mechanism)),
  which a weakly-consistent or eventually-consistent store would make
  harder to reason about correctly.
- **Operational maturity.** Postgres is a well-understood dependency with
  mature tooling (`pg_dump`, replication, managed offerings on every major
  cloud) — an easier on-call story than a newer or more specialized
  database for a small team.
- **JSONB gives schema flexibility at the cost of query ergonomics for
  payload internals.** Querying into arbitrary payload fields (e.g.
  "all votes with weight > X") requires JSONB operators or a future
  migration to promote that field to a real column (as was done for
  `voter_address` in migration `002_add_voter_index.sql`) — it is not
  automatically indexed like a first-class column.
- **A relational schema is a poor fit for graph-like or highly nested
  queries**, but the indexer's access patterns (list/filter by a handful of
  scalar keys, full-text search over two text fields) don't need that; this
  is a deliberate trade of generality for simplicity given the known query
  shapes.
- **Requires running and migrating a stateful database**, on top of the
  Redis dependency `backend/` already has (ADR-015) — one more piece of
  infrastructure than a fully embedded/serverless alternative, addressed
  operationally in
  [`indexer/README.md`](../../indexer/README.md#prerequisites).

## Alternatives Considered

### A. SQLite (embedded, no separate DB server)
Rejected for production: SQLite's single-writer model and lack of native
network access are a poor fit for a service that may run as multiple
replicas or need remote access from operational tooling. Reasonable for
local single-process development, but the indexer already supports that via
a local/Dockerized Postgres instance (`docker run postgres:16-alpine` — see
[`indexer/README.md`](../../indexer/README.md#1-install-prerequisites)), so
there was no need to maintain two schemas/dialects.

### B. A document store (e.g. MongoDB) keyed on the JSONB-like event payload
Rejected: the indexer's actual query needs (filter by proposal ID, voter,
topic, ledger range; full-text search; a uniqueness constraint for dedup)
are fundamentally relational/indexed-scalar queries, not document queries.
A document store would still need equivalent secondary indexes for these
access patterns, without gaining anything the JSONB `payload` column
doesn't already provide for the genuinely schema-flexible part (the raw
event body).

### C. A time-series database (e.g. TimescaleDB, InfluxDB)
Rejected: contract events are not a metrics/time-series workload — the
dominant queries are "all events for proposal X" and "all votes by voter
Y", not aggregations over time windows. TimescaleDB is itself a Postgres
extension, so if time-bucketed queries become a real need later, it can be
adopted without a storage-engine migration.

### D. Reuse the `backend/` service's Redis instance as the source of truth
Rejected: Redis is used deliberately as a cache in front of `backend/`'s
API (ADR-015), not as durable storage — it has no query language suited to
the indexer's filtering needs, and using it as primary storage would risk
data loss on eviction/restart unless persistence is carefully configured,
defeating the purpose of a cache layer.
