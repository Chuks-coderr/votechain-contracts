# SEC-013 — SQL Injection Prevention Audit: Indexer Queries

| Field | Value |
|---|---|
| Record type | Security audit |
| Date | 2026-09-29 |
| Status | Pass; no vulnerabilities found |
| Severity | Not applicable |
| Affected components | `indexer/src/main.rs`, `api/src/lib.rs` |
| Reporter / reviewer | Internal security review |

Format: [SEC template](SEC-TEMPLATE.md).

---

## Summary

This document records the results of a manual audit of all SQL queries executed by the
VoteChain indexer and API components. The audit was performed to satisfy the acceptance
criteria of GitHub issue #100.

**Conclusion:** No SQL injection vulnerabilities were found. Every user-supplied or
externally-sourced value is bound via sqlx parameterised placeholders (`$1`, `$2`, …).
No dynamic query string construction was identified.

---

## Scope

| File | Purpose |
|------|---------|
| `indexer/src/main.rs` | PostgreSQL-backed event indexer and REST API |
| `api/src/lib.rs` | In-memory indexer library (no SQL) |

---

## Queries Audited: `indexer/src/main.rs`

### 1. `last_ledger` — Read cursor position

```rust
sqlx::query_as("SELECT last_ledger FROM indexer_cursor WHERE contract_id = $1")
    .bind(contract_id)
    .fetch_optional(pool)
    .await?;
```

- **User-supplied values:** `contract_id` (string, from environment config `CONTRACT_ID`)
- **Binding:** `contract_id` bound as `$1` via `.bind(contract_id)`
- **Dynamic construction:** None
- **Result:** ✅ Safe

---

### 2. `save_cursor` — Upsert cursor position

```rust
sqlx::query(
    "INSERT INTO indexer_cursor (contract_id, last_ledger)
     VALUES ($1, $2)
     ON CONFLICT (contract_id) DO UPDATE SET last_ledger = EXCLUDED.last_ledger",
)
.bind(contract_id)
.bind(ledger as i64)
.execute(pool)
.await?;
```

- **User-supplied values:** `contract_id` (env config), `ledger` (u64 cast to i64, derived from Horizon API response)
- **Binding:** `contract_id` → `$1`, `ledger` → `$2`
- **Dynamic construction:** None
- **Result:** ✅ Safe

---

### 3. `insert_event` — Insert contract event

```rust
sqlx::query(
    "INSERT INTO contract_events
         (ledger_seq, tx_hash, contract_id, topic, proposal_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING",
)
.bind(ev.ledger as i64)
.bind(&ev.transaction_hash)
.bind(&ev.contract_id)
.bind(topic)
.bind(proposal_id)
.bind(&ev.value)
.execute(pool)
.await?;
```

- **User-supplied values:** All six values derive from the Horizon API response
  (`ev.ledger`, `ev.transaction_hash`, `ev.contract_id`, `topic`, `proposal_id`, `ev.value`)
- **Binding:** All six values bound via positional parameters `$1`–`$6`
- **Dynamic construction:** None
- **Note:** `topic` is additionally validated against an explicit allowlist (match arm in
  `poll_once`) before `insert_event` is ever called, providing a defence-in-depth layer.
- **Result:** ✅ Safe

---

### 4. `list_events` — Fetch recent events (REST endpoint)

```rust
sqlx::query_as::<_, EventRow>(
    "SELECT id, ledger_seq, tx_hash, topic, proposal_id, payload, ingested_at
     FROM contract_events ORDER BY ledger_seq DESC LIMIT 100",
)
.fetch_all(&pool)
.await
.unwrap_or_default();
```

- **User-supplied values:** None — the query takes no external input; the `LIMIT 100`
  is a hard-coded constant.
- **Binding:** N/A
- **Dynamic construction:** None
- **Result:** ✅ Safe

---

### 5. `list_proposal_events` — Fetch events by proposal ID (REST endpoint)

```rust
sqlx::query_as::<_, EventRow>(
    "SELECT id, ledger_seq, tx_hash, topic, proposal_id, payload, ingested_at
     FROM contract_events WHERE proposal_id = $1 ORDER BY ledger_seq ASC",
)
.bind(id)
.fetch_all(&pool)
.await
.unwrap_or_default();
```

- **User-supplied values:** `id` is the path parameter from the HTTP request
  (`axum::extract::Path<i64>`), extracted and typed as `i64` by Axum before reaching sqlx.
- **Binding:** `id` bound as `$1`
- **Dynamic construction:** None
- **Note:** Axum's `Path<i64>` extractor rejects non-integer path segments at the HTTP
  layer, so only valid `i64` values reach the query.
- **Result:** ✅ Safe

---

### 6. Test helper queries (inside `#[cfg(test)]`)

#### 6a. `Harness::rows` — fetch rows for assertion

```rust
sqlx::query_as(
    "SELECT ledger_seq, tx_hash, topic, proposal_id
     FROM contract_events ORDER BY ledger_seq, tx_hash",
)
.fetch_all(&self.pool)
.await
.unwrap()
```

- **User-supplied values:** None — test-only, no external input.
- **Result:** ✅ Safe (test code, not reachable in production)

#### 6b. `cursor_does_not_advance_when_batch_fails_midway` — DDL helpers

```rust
sqlx::query(
    "ALTER TABLE contract_events ADD CONSTRAINT test_reject_poison CHECK (tx_hash <> 'poison')",
)
.execute(&h.pool)
.await
.unwrap();

sqlx::query("ALTER TABLE contract_events DROP CONSTRAINT test_reject_poison")
    .execute(&h.pool)
    .await
    .unwrap();
```

- **User-supplied values:** None — fully static DDL strings used only in test code.
- **Result:** ✅ Safe (test code, not reachable in production)

---

## Queries Audited: `api/src/lib.rs`

`api/src/lib.rs` implements an **in-memory indexer** backed by `HashMap` data
structures. It contains **no SQL queries whatsoever**. All data access is performed
via Rust `HashMap` and iterator operations.

- **SQL queries found:** 0
- **SQL injection surface:** None
- **Result:** ✅ Not applicable

---

## Methodology

1. Full text search of both files for `sqlx::query`, `sqlx::query_as`, `raw_sql`,
   `query!`, `query_as!`, and `format!` in proximity to any query string.
2. Manual review of every match to verify:
   a. The query string is a static string literal (not constructed via `format!` or
      string concatenation at runtime).
   b. Every placeholder (`$N`) is matched by a corresponding `.bind(...)` call.
   c. The bound value is typed appropriately (Axum path extractors enforce `i64`
      before values reach sqlx).
3. Confirmed `topic` values are allowlist-validated in `poll_once` before being
   passed to `insert_event`, providing defence-in-depth beyond parameter binding.

---

## Tooling

| Tool | Version | Purpose |
|------|---------|---------|
| sqlx | See `Cargo.lock` | Compile-time query validation and parameterised binding |
| cargo-audit | Latest | Checks for known CVEs in sqlx and all transitive deps |
| cargo-deny | Latest | Licence compliance and crate ban enforcement |

---

## Pass Conditions

| Criterion | Result |
|-----------|--------|
| All SQL queries use parameterised placeholders (`$1`, `$2`, …) | ✅ Pass |
| No dynamic query string construction via `format!` or concatenation | ✅ Pass |
| No raw/unparameterised user input interpolated into query strings | ✅ Pass |
| `api/src/lib.rs` contains no SQL (in-memory only) | ✅ Pass |
| Test-only queries contain no externally-controlled input | ✅ Pass |

---

## Recommendations

1. **Maintain the `cargo deny check` CI step** (tracked separately) to prevent
   downgrade to a known-vulnerable sqlx release.
2. **Keep `topic` allowlisting** in `poll_once` as defence-in-depth even though
   the parameter binding already prevents injection.
3. **Add `sqlx::query!` macro variants** in future refactors where possible —
   the `query!` macros verify SQL syntax and column types at compile time, providing
   an additional layer of correctness assurance.

---

## Related Documents

- [audit-scope.md](audit-scope.md) — overall audit scope; sqlx added to approved tools
- [SEC-008-token-balance-fetch-audit.md](SEC-008-token-balance-fetch-audit.md)
- [SEC-009-reinit-guard.md](SEC-009-reinit-guard.md)
- [SEC-010-reentrancy-cast-vote.md](SEC-010-reentrancy-cast-vote.md)
- [known-issues.md](known-issues.md)
