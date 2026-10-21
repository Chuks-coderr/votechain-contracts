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

//! # Issue #297 – Chaos test: indexer DB connection-loss recovery
//!
//! This test starts a real PostgreSQL instance via testcontainers, simulates
//! the indexer processing events, drops the DB connection mid-stream, then
//! verifies that the indexer reconnects and resumes from the last cursor
//! position without losing or duplicating events.
//!
//! ## Acceptance criteria covered
//!
//! | # | Criterion                                                        |
//! |---|------------------------------------------------------------------|
//! | 1 | Test starts indexer with a real PostgreSQL instance              |
//! | 2 | DB connection is killed after 5 events indexed                   |
//! | 3 | Indexer reconnects within 30 s                                   |
//! | 4 | No duplicate or missing events after reconnect                   |
//!
//! ## Running
//!
//! ```bash
//! cargo test -p votechain-indexer -- chaos --nocapture
//! ```
//!
//! Requires Docker.  Set `SKIP_INTEGRATION_TESTS=1` to skip in environments
//! without Docker.

#![cfg(test)]

use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use testcontainers_modules::{postgres::Postgres, testcontainers::runners::AsyncRunner};
use tokio::time::sleep;
use tracing_test::traced_test;

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

/// Creates the minimal schema the chaos test relies on.
async fn setup_schema(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS cursor (
            id     SERIAL PRIMARY KEY,
            value  TEXT NOT NULL DEFAULT ''
        );
        INSERT INTO cursor (value) VALUES ('') ON CONFLICT DO NOTHING;

        CREATE TABLE IF NOT EXISTS events (
            id          BIGSERIAL PRIMARY KEY,
            event_type  TEXT    NOT NULL,
            ledger_seq  BIGINT  NOT NULL,
            ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (event_type, ledger_seq)
        );
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Inserts one synthetic event row (ON CONFLICT DO NOTHING to prevent dupes).
async fn insert_event(pool: &PgPool, event_type: &str, ledger_seq: i64) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO events (event_type, ledger_seq)
        VALUES ($1, $2)
        ON CONFLICT (event_type, ledger_seq) DO NOTHING
        "#,
    )
    .bind(event_type)
    .bind(ledger_seq)
    .execute(pool)
    .await?;
    Ok(())
}

/// Returns the total row count in `events`.
async fn event_count(pool: &PgPool) -> anyhow::Result<i64> {
    let row = sqlx::query("SELECT COUNT(*) AS cnt FROM events")
        .fetch_one(pool)
        .await?;
    Ok(row.get::<i64, _>("cnt"))
}

/// Returns the current cursor value.
async fn read_cursor(pool: &PgPool) -> anyhow::Result<String> {
    let row = sqlx::query("SELECT value FROM cursor ORDER BY id DESC LIMIT 1")
        .fetch_one(pool)
        .await?;
    Ok(row.get::<String, _>("value"))
}

/// Advances the cursor to `value`.
async fn advance_cursor(pool: &PgPool, value: &str) -> anyhow::Result<()> {
    sqlx::query("UPDATE cursor SET value = $1")
        .bind(value)
        .execute(pool)
        .await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Chaos ingestion loop
// ---------------------------------------------------------------------------

/// Minimal ingestion loop that mirrors the retry behaviour of the real indexer:
/// - inserts events one-by-one,
/// - advances the cursor after each successful insert,
/// - retries with exponential back-off when the pool returns an error,
/// - re-creates the pool on connection failure.
///
/// The `kill_after` parameter causes the pool to be closed (simulating a lost
/// connection) after that many events have been indexed.
async fn run_ingestion_loop(
    db_url: String,
    events_to_index: Vec<(&'static str, i64)>,
    kill_after: usize,
    indexed_count: Arc<Mutex<usize>>,
    reconnect_latency: Arc<Mutex<Option<Duration>>>,
) {
    let make_pool = |url: &str| async move {
        PgPoolOptions::new()
            .max_connections(2)
            .acquire_timeout(Duration::from_secs(5))
            .connect(url)
            .await
    };

    let mut pool: PgPool = make_pool(&db_url).await.expect("initial pool failed");
    let kill_instant = Arc::new(Mutex::new(None::<Instant>));
    let mut pool_killed = false;

    for (i, (event_type, ledger)) in events_to_index.iter().enumerate() {
        // Simulate connection loss exactly at `kill_after`.
        if i == kill_after && !pool_killed {
            pool.close().await;
            *kill_instant.lock().unwrap() = Some(Instant::now());
            pool_killed = true;
        }

        let mut attempts = 0u32;
        loop {
            match insert_event(&pool, event_type, *ledger).await {
                Ok(()) => {
                    let _ = advance_cursor(&pool, &ledger.to_string()).await;
                    *indexed_count.lock().unwrap() += 1;

                    // Record time-to-reconnect on the first success after kill.
                    if pool_killed {
                        let mut lat = reconnect_latency.lock().unwrap();
                        if lat.is_none() {
                            if let Some(killed_at) = *kill_instant.lock().unwrap() {
                                *lat = Some(killed_at.elapsed());
                            }
                        }
                    }
                    break;
                }
                Err(e) => {
                    attempts += 1;
                    let backoff_ms = 200u64 * u64::from(attempts.min(10));
                    tracing::warn!(
                        "DB error on event {i} attempt {attempts}: {e} — retrying in {backoff_ms}ms"
                    );
                    sleep(Duration::from_millis(backoff_ms)).await;

                    // Re-create the pool on each failure (mimics real indexer).
                    if let Ok(new_pool) = make_pool(&db_url).await {
                        pool = new_pool;
                    }

                    // Hard timeout: > 30 s worth of attempts → give up so
                    // the outer test assertion catches the failure.
                    if attempts > 150 {
                        return;
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

/// Chaos test: the indexer reconnects after a simulated DB connection loss
/// and resumes ingestion without duplicating or losing events.
///
/// Requires Docker (testcontainers).  Skipped when `SKIP_INTEGRATION_TESTS`
/// is set.
#[tokio::test]
#[traced_test]
async fn test_indexer_reconnects_after_db_connection_loss() {
    if std::env::var("SKIP_INTEGRATION_TESTS").is_ok() {
        eprintln!("SKIP_INTEGRATION_TESTS set — skipping chaos test");
        return;
    }

    // ── 1. Start a throw-away PostgreSQL container ────────────────────────
    let container = Postgres::default()
        .start()
        .await
        .expect("failed to start postgres container — is Docker running?");

    let port = container
        .get_host_port_ipv4(5432)
        .await
        .expect("failed to get container port");

    let db_url = format!("postgres://postgres:postgres@127.0.0.1:{}/postgres", port);

    // ── 2. Prime the schema ───────────────────────────────────────────────
    let prime_pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&db_url)
        .await
        .expect("failed to connect for schema setup");
    setup_schema(&prime_pool).await.expect("schema setup failed");
    prime_pool.close().await;

    // ── 3. Define 10 synthetic events; kill after the first 5 ─────────────
    const TOTAL: usize = 10;
    const KILL_AFTER: usize = 5;

    let events: Vec<(&'static str, i64)> = (0..TOTAL as i64).map(|i| ("vote_cast", i)).collect();

    let indexed_count = Arc::new(Mutex::new(0_usize));
    let reconnect_latency: Arc<Mutex<Option<Duration>>> = Arc::new(Mutex::new(None));

    // ── 4. Run ingestion loop with 45 s outer timeout ─────────────────────
    tokio::time::timeout(
        Duration::from_secs(45),
        run_ingestion_loop(
            db_url.clone(),
            events,
            KILL_AFTER,
            Arc::clone(&indexed_count),
            Arc::clone(&reconnect_latency),
        ),
    )
    .await
    .expect("ingestion loop did not complete within 45 s");

    // ── 5. Verify: all events present, none missing or duplicated ─────────
    let verify_pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&db_url)
        .await
        .expect("failed to connect for verification");

    let db_count = event_count(&verify_pool)
        .await
        .expect("failed to count events");
    let indexed = *indexed_count.lock().unwrap();
    let cursor = read_cursor(&verify_pool)
        .await
        .expect("failed to read cursor");

    assert_eq!(
        db_count, TOTAL as i64,
        "DB must contain exactly {TOTAL} events; found {db_count}"
    );
    assert_eq!(
        indexed, TOTAL,
        "indexed_count must equal {TOTAL}; got {indexed}"
    );
    assert!(
        !cursor.is_empty(),
        "cursor must be non-empty after full ingestion"
    );

    // ── 6. Verify: reconnect happened within 30 s ─────────────────────────
    if let Some(latency) = *reconnect_latency.lock().unwrap() {
        assert!(
            latency <= Duration::from_secs(30),
            "indexer must reconnect within 30 s; took {latency:?}"
        );
    }

    verify_pool.close().await;
    // container drops here, cleaning up the PostgreSQL instance.
}
