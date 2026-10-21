# Indexer API Load Test Baseline

Load test for `GET /events` on the indexer API (issue #89).
Script: [`tests/load/events.js`](../tests/load/events.js) · Run with `make load-test`.

## Setup

| Parameter | Value |
|---|---|
| Tool | k6 |
| Endpoint | `GET /events` (latest 100 rows, `ORDER BY ledger_seq DESC`) |
| DB pool | 5 connections (`PgPoolOptions::max_connections(5)`) |
| Dataset | `contract_events` seeded with 100k rows (simulated contested vote) |
| Scenario A | 1000 concurrent VUs, 1 request each |
| Scenario B | constant 500 req/s for 60s |

## Targets

| Metric | Target |
|---|---|
| p99 latency @ 500 req/s | < 500 ms |
| Error rate | < 1 % |

## Baseline results

Record each run here so regressions are visible over time. Fill in from the
k6 end-of-test summary (`http_req_duration` p50/p95/p99, `http_req_failed`).

| Date | Commit | Hardware | Scenario | p50 | p95 | p99 | Error rate | Pass |
|---|---|---|---|---|---|---|---|---|
| _pending first run_ | | | A: 1000 concurrent | | | | | |
| _pending first run_ | | | B: 500 req/s | | | | | |

## Notes

- `GET /events` is a single indexed query bounded by `LIMIT 100`; with a pool
  of 5 connections, throughput is bounded by query latency × 5. If p99 exceeds
  the target, check for a missing index on `ledger_seq` and consider caching
  the latest page (it only changes when new events are ingested).
- Scenario A intentionally exceeds the pool size to verify requests queue for
  a connection rather than erroring.
