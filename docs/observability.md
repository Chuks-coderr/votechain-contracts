# Observability

The VoteChain backend (`backend/`) exposes Prometheus metrics and ships with a
local Prometheus + Grafana stack for development. (#66)

## Metrics endpoint

`GET /metrics` returns metrics in Prometheus text-exposition format, mounted
before rate-limiting and auth (same rationale as `/health` and `/ready` — see
[STAGING.md](STAGING.md) and `backend/src/routes/health.ts`).

| Metric | Type | Labels | Description |
|---|---|---|---|
| `votechain_http_requests_total` | counter | `method`, `route`, `status` | Total HTTP requests |
| `votechain_http_request_duration_seconds` | histogram | `method`, `route`, `status` | Request latency; use `histogram_quantile()` for p50/p95/p99 |
| `votechain_cache_hit_rate` | gauge | — | Redis proposal-cache hit rate (0–1), backed by the existing `GET /metrics/cache` counters |
| `votechain_active_db_connections` | gauge | — | 1 when Redis (the backend's only persistent-connection dependency today) is connected, 0 otherwise |

Route labels use the matched Express route pattern (e.g. `/api/proposals/:id`),
not the raw URL, to keep cardinality bounded.

Default Node.js process metrics (`process_cpu_seconds_total`, memory,
event-loop lag, etc.) are also collected via `prom-client`'s
`collectDefaultMetrics()`.

## Local stack

```bash
docker compose up backend redis prometheus grafana
```

- Prometheus: http://localhost:9090 (scrapes `backend:3001/metrics` every 15s,
  config in [`infra/prometheus/prometheus.yml`](../infra/prometheus/prometheus.yml))
- Grafana: http://localhost:3002 (admin/admin, anonymous viewer access enabled
  for local dev) — the "VoteChain Backend" dashboard is auto-provisioned from
  [`infra/grafana/votechain-backend.json`](../infra/grafana/votechain-backend.json)
  via [`infra/grafana/provisioning`](../infra/grafana/provisioning)

The dashboard includes: request rate by route/status, p50/p95/p99 latency,
cache hit rate, active DB (Redis) connections, and 5xx error ratio.

### SLO dashboard (#272)

A dedicated SLO dashboard is available at
[`infra/grafana/votechain-api-slo.json`](../infra/grafana/votechain-api-slo.json),
auto-provisioned alongside the backend dashboard. It tracks two SLOs:

| SLO | Target | Measurement |
|-----|--------|-------------|
| Availability | 99.9% (error budget = 0.1%) | 5xx error rate vs total requests |
| Latency | P95 < 500ms | 95th percentile request duration |

Panels:

- **Availability %** — current and historical availability with SLO threshold
- **Error Budget Remaining** — gauge showing how much of the 30-day error
  budget remains
- **Error Budget Burn Rate** — multi-window burn rate (5m, 1h, 6h) with 2x
  and 5x threshold lines
- **P95 Latency vs SLO** — P95 latency with the 500ms SLO line
- **Error Rate** — 5xx error rate with the 0.1% error budget line
- **Request Rate by Status Class** — stacked request rate by HTTP status
- **Latency Percentiles** — p50/p95/p99 with the 500ms SLO line

## Alerting

Alert rules live in
[`infra/prometheus/alerts.yml`](../infra/prometheus/alerts.yml) and are loaded
by Prometheus via `rule_files`:

- **HighApiLatencyP99** — fires when p99 request latency exceeds 2s for 5
  minutes.
- **LowCacheHitRate** — fires when the Redis cache hit rate drops below 50%
  for 10 minutes.
- **SLOErrorBudgetBurnRate2x** — fires when the 5xx error rate exceeds 2x
  the error budget allowance over both 1h and 5m windows (warning).
- **SLOErrorBudgetBurnRate5x** — fires when the 5xx error rate exceeds 5x
  the error budget allowance over both 6h and 30m windows (critical).
- **SLOLatencyP95Exceeded** — fires when P95 latency exceeds 500ms for 10
  minutes.

These rules define alert *conditions* only; wiring Alertmanager to a paging
or chat channel is left to the deploying environment and is not included
here.

## Known gaps

- `votechain_active_db_connections` reflects Redis connectivity (the only
  persistent-connection dependency the Node backend currently has), not a
  SQL connection pool. The `indexer` service maintains a Postgres pool
  (`sqlx::PgPool`) but does not yet expose Prometheus metrics — a natural
  follow-up if/when the indexer's HTTP surface needs its own dashboard.
- Grafana runs with anonymous viewer access and a default `admin/admin`
  password for local-dev convenience only; do not reuse this
  `docker-compose.yml` configuration as-is in a shared or public environment.
