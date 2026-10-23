# Indexer Database Schema

This document describes the PostgreSQL schema used by the VoteChain indexer,
the relationships between tables, the index strategy, and example queries for
common access patterns.

The schema is managed via [sqlx built-in migrations](https://docs.rs/sqlx/latest/sqlx/macro.migrate.html)
located in [`indexer/migrations/`](../indexer/migrations/).

---

## Entity-Relationship Diagram

```
┌─────────────────────────┐           ┌──────────────────────────────────────────────┐
│      indexer_cursor      │           │               contract_events                │
├─────────────────────────┤           ├──────────────────────────────────────────────┤
│ contract_id  TEXT  (PK)  │           │ id            BIGSERIAL   (PK)               │
│ last_ledger  BIGINT      │           │ ledger_seq    BIGINT      NOT NULL           │
└─────────────────────────┘           │ tx_hash       TEXT        NOT NULL           │
                                      │ contract_id   TEXT        NOT NULL           │
                                      │ topic         TEXT        NOT NULL           │
                                      │ proposal_id   BIGINT      (nullable)         │
                                      │ voter_address TEXT        (nullable)         │
                                      │ payload       JSONB       NOT NULL           │
                                      │ ingested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()│
                                      └──────────────────────────────────────────────┘
                                                        │ proposal_id (FK-like, no FK constraint)
                                                        ▼
                                      ┌──────────────────────────────────────────────┐
                                      │                 proposals                    │
                                      │         (managed by backend / API)           │
                                      ├──────────────────────────────────────────────┤
                                      │ id             BIGINT / TEXT  (PK)           │
                                      │ title          TEXT                          │
                                      │ description    TEXT                          │
                                      │ state          TEXT                          │
                                      │ search_vector  tsvector  (generated, stored) │
                                      └──────────────────────────────────────────────┘
```

> **Note:** `proposal_id` in `contract_events` references the on-chain proposal
> identifier. There is no enforced foreign-key constraint because the indexer
> may ingest events before the backend has materialised the proposal row.

---

## Table Reference

### `indexer_cursor`

Tracks the last ledger sequence successfully processed for each contract.
Used on startup to resume indexing from the correct point rather than replaying
the entire chain.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `contract_id` | `TEXT` | NO | Stellar contract address (primary key) |
| `last_ledger` | `BIGINT` | NO | Last ledger sequence committed to the DB (default `0`) |

**Notes:**
- One row per monitored contract.
- Updated atomically with each batch of ingested events inside a transaction so
  that a crash mid-batch leaves the cursor in the previous valid state.

---

### `contract_events`

One row per on-chain VoteChain contract event. This is the primary table
consumed by the REST API and the governance-alerts bot.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | `BIGSERIAL` | NO | Auto-incrementing surrogate primary key |
| `ledger_seq` | `BIGINT` | NO | Stellar ledger sequence number |
| `tx_hash` | `TEXT` | NO | Transaction hash (hex) |
| `contract_id` | `TEXT` | NO | Stellar contract address that emitted the event |
| `topic` | `TEXT` | NO | Event topic string, e.g. `"created"`, `"vote"`, `"final"`, `"executed"`, `"cancelled"` |
| `proposal_id` | `BIGINT` | YES | On-chain proposal ID; `NULL` for non-proposal events |
| `voter_address` | `TEXT` | YES | Stellar account address; only populated for `topic = 'vote'` events |
| `payload` | `JSONB` | NO | Full event payload as JSON |
| `ingested_at` | `TIMESTAMPTZ` | NO | Wall-clock time the row was written (default `NOW()`) |

**De-duplication guarantee (migration 003):**
A unique index `uq_events_dedupe` on `(contract_id, ledger_seq, tx_hash, topic, md5(payload::text))`
ensures that re-delivering an already-processed ledger range is idempotent —
the `ON CONFLICT DO NOTHING` clause on `INSERT` silently skips duplicate rows.

---

### `proposals` (search extension)

The `proposals` table is owned by the backend service. Migration
`003_add_proposal_search.sql` extends it with a full-text search column.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `search_vector` | `tsvector` | YES | Auto-generated, stored. Combines `title` (weight A) and `description` (weight B) using the `english` dictionary |

---

## Index Strategy

### Indexes on `contract_events`

| Index name | Columns | Type | Why it exists |
|------------|---------|------|---------------|
| `idx_events_contract` | `contract_id` | B-tree | Filter all events for a specific contract (most queries are scoped to one contract) |
| `idx_events_topic` | `topic` | B-tree | Filter by event type, e.g. fetch only `"vote"` events |
| `idx_events_proposal` | `proposal_id` | B-tree | Look up all events related to one proposal |
| `idx_events_ledger` | `ledger_seq` | B-tree | Range scans during backfill and cursor advancement |
| `idx_events_voter` | `voter_address` WHERE `voter_address IS NOT NULL` | Partial B-tree | Efficiently find all votes cast by a specific address. The `WHERE` clause excludes non-vote rows, keeping the index small |
| `idx_events_proposal_ledger` | `(proposal_id, ledger_seq)` WHERE `proposal_id IS NOT NULL` | Composite partial B-tree | Common pattern: "all events for proposal P ordered chronologically". Composite covers both the equality filter (`proposal_id`) and the sort (`ledger_seq`) |
| `uq_events_dedupe` | `(contract_id, ledger_seq, tx_hash, topic, md5(payload::text))` | Unique B-tree | Enforce at-most-once ingestion; powers `ON CONFLICT DO NOTHING` |

### Index on `proposals`

| Index name | Column | Type | Why it exists |
|------------|--------|------|---------------|
| `proposals_search_idx` | `search_vector` | GIN | Serves `websearch_to_tsquery` full-text queries without a sequential scan |

---

## Example Queries

### Proposals by state

```sql
-- All contract_events that mark a proposal as finalised (passed or rejected)
SELECT
    proposal_id,
    tx_hash,
    ledger_seq,
    payload->>'outcome' AS outcome,
    ingested_at
FROM contract_events
WHERE topic = 'final'
  AND contract_id = $1          -- bind: your contract address
ORDER BY ledger_seq DESC;
```

```sql
-- Proposals currently in 'active' state via the proposals table
SELECT id, title, state, created_at
FROM proposals
WHERE state = 'active'
ORDER BY created_at DESC
LIMIT 20;
```

### Votes by voter

```sql
-- All votes cast by a specific address, newest first
SELECT
    proposal_id,
    tx_hash,
    ledger_seq,
    payload->>'choice'  AS choice,
    payload->>'weight'  AS voting_weight,
    ingested_at
FROM contract_events
WHERE topic         = 'vote'
  AND voter_address = $1          -- bind: Stellar account address
  AND contract_id   = $2          -- bind: contract address
ORDER BY ledger_seq DESC;
```

### Full vote history for a proposal

```sql
-- All events for one proposal, ordered chronologically
SELECT
    topic,
    voter_address,
    ledger_seq,
    tx_hash,
    payload,
    ingested_at
FROM contract_events
WHERE proposal_id = $1            -- bind: proposal ID
  AND contract_id = $2            -- bind: contract address
ORDER BY ledger_seq ASC, id ASC;
```

### Full-text search across proposals

```sql
-- Proposals matching a keyword search
SELECT id, title, state
FROM proposals
WHERE search_vector @@ websearch_to_tsquery('english', $1)  -- bind: search string
ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', $1)) DESC
LIMIT 20;
```

### Event counts per proposal (leaderboard / analytics)

```sql
-- Number of votes per proposal
SELECT
    proposal_id,
    COUNT(*) AS vote_count
FROM contract_events
WHERE topic       = 'vote'
  AND contract_id = $1
GROUP BY proposal_id
ORDER BY vote_count DESC;
```

### Resumption cursor lookup

```sql
-- Read the last processed ledger for a contract (used on indexer startup)
SELECT last_ledger
FROM indexer_cursor
WHERE contract_id = $1;

-- Update cursor after a successful batch
UPDATE indexer_cursor
SET    last_ledger = $2
WHERE  contract_id = $1;
```

---

## Migration History

| File | Description |
|------|-------------|
| `001_init.sql` | Creates `indexer_cursor` and `contract_events` with base indexes |
| `002_add_voter_index.sql` | Adds `voter_address` column + partial index; adds composite `(proposal_id, ledger_seq)` index |
| `003_add_proposal_search.sql` | Extends `proposals` with `search_vector` generated column and GIN index |
| `003_dedupe_events.sql` | Removes duplicate rows and adds unique de-duplication index on `contract_events` |

> **Note on the two `003_` files:** both files carry the `003` prefix because
> they were developed in parallel branches and merged. sqlx applies migrations
> in lexicographic filename order, so `003_add_proposal_search.sql` runs before
> `003_dedupe_events.sql`. Neither depends on the other.

---

## Related Documentation

- [`indexer/migrations/README.md`](../indexer/migrations/README.md) — how sqlx migrations work in this project
- [`indexer/README.md`](../indexer/README.md) — indexer service overview
- [`docs/api-reference.md`](api-reference.md) — REST endpoints that query this schema
- [`docs/adr/ADR-014-postgresql-storage-backend.md`](adr/ADR-014-postgresql-storage-backend.md) — decision record for choosing PostgreSQL
