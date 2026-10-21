# ADR-013: A Separate Indexer Service (Not Querying Horizon Directly from the API)

**Status:** Accepted
**Date:** 2026-09-29
**Issue:** [#77 — Write ADR for indexer and API architecture choices](https://github.com/veracindarella/votechain-contracts/issues/77)

## Context

VoteChain has two off-chain read surfaces: the `indexer/` crate (Rust +
Axum + PostgreSQL, `GET /events`, `GET /events/proposals/{id}`) and the
`backend/` service (Node/Express + Redis, `GET /proposals`, `GET
/proposals/:id`, leaderboard endpoints) that the frontend actually talks to.
Both ultimately need proposal and vote data that originates as Soroban
contract events, retrievable from Stellar Horizon's
`/contracts/{id}/events` endpoint.

The straightforward alternative to what exists today would be to have
`backend/` (or any API layer) call Horizon directly on each incoming
request, or to have `backend/` re-run the full contract-events query on a
timer itself instead of via a separate `indexer` binary. Given `backend/`
already exists as a distinct Node service from the Rust indexer, the real
question this ADR answers is: why keep event ingestion as its own
long-running Rust service with its own database, instead of folding it into
`backend/` (querying Horizon inline) or the API layer generally.

## Decision

Keep the indexer as a standalone, continuously-running Rust process
(`indexer/src/main.rs`) that:

1. Polls Horizon on a timer (`POLL_INTERVAL_SECS`, default 3s) via
   `poll_once`, independent of any inbound API request.
2. Persists every recognized event to PostgreSQL with an
   ingestion cursor (`indexer_cursor.last_ledger`) tracked per contract.
3. Serves its own minimal read API purely from Postgres — it never calls
   Horizon in the request path.
4. Best-effort notifies `backend/` (`POST {BACKEND_URL}/api/proposals/invalidate`)
   after ingesting a state-changing event, so `backend/`'s Redis cache can
   be invalidated promptly (see ADR-015).

Horizon is treated purely as an *event source to be consumed asynchronously*,
never as something an end-user request waits on synchronously.

## Consequences

- **API latency and availability are decoupled from Horizon.** A slow or
  degraded Horizon endpoint delays how fresh the data is (bounded by
  `POLL_INTERVAL_SECS`), but never blocks or fails an API response — reads
  always come from Postgres, which the indexer controls independently of
  request traffic.
- **Horizon load is bounded and predictable.** One poller issues one
  request per interval regardless of how many end users are hitting the
  API concurrently, instead of request volume translating 1:1 into Horizon
  load (which would multiply rate-limit risk — see the 429 guidance in
  [`indexer/README.md`](../../indexer/README.md#horizon-429-rate-limits)).
- **Queries the API needs (filter by proposal, by voter, full-text search)
  can be served with ordinary SQL and indexes** instead of re-deriving them
  from raw Horizon event pages on every request, which don't support
  arbitrary filtering or pagination the way Postgres does.
- **Operational cost:** this is a second stateful service to deploy,
  migrate, and monitor (see [`indexer/README.md`](../../indexer/README.md)
  and [`indexer/migrations/README.md`](../../indexer/migrations/README.md)),
  on top of `backend/`'s own Redis dependency. There are now three moving
  parts (indexer, Postgres, backend+Redis) instead of one stateless API
  process.
- **Eventual consistency, not immediate consistency.** A transaction
  submitted on-chain is not visible via the indexer/API until the next poll
  cycle picks it up (bounded by `POLL_INTERVAL_SECS`, typically single-digit
  seconds). The cache-invalidation hook to `backend/` narrows this gap for
  cached reads but does not eliminate the underlying poll delay.
- **Cursor and replay logic become the indexer's responsibility.** Handling
  missed events, restarts, and reorg-adjacent re-delivery is centralized in
  one place (`poll_once` + `indexer_cursor`) rather than duplicated in every
  service that would otherwise talk to Horizon directly.

## Alternatives Considered

### A. Query Horizon directly from `backend/` on each request
Rejected: ties API response time and availability directly to Horizon's,
multiplies Horizon request volume by end-user request volume (severe
429 risk under any real traffic), and offers no efficient way to filter,
paginate, or full-text-search proposals — Horizon's events endpoint is a
ledger-ordered event stream, not a query engine.

### B. Have `backend/` poll Horizon itself instead of a separate Rust indexer
Considered, since `backend/` already exists as the service the frontend
talks to. Rejected for this iteration: it would mix long-running background
polling/ingestion concerns into the same process as request handling
(harder to reason about backpressure and restarts), and the indexer's
Postgres schema (structured event rows with dedup/cursor semantics) is a
different data-modeling problem from `backend/`'s cache-fronted proposal
API. Keeping them separate lets each be scaled, deployed, and restarted
independently — the indexer can fall behind or restart without taking the
user-facing API down, and vice versa.

### C. Webhook/streaming push from Horizon instead of polling
Not available: Horizon does not offer a push/webhook mechanism for contract
events as of this writing — only a paginated REST cursor endpoint. Polling
is the only integration option Horizon currently supports; see also the
cursor design discussion in
[`indexer/README.md`](../../indexer/README.md#the-cursor-mechanism).

### D. Serverless/on-demand ingestion (e.g. a Lambda triggered per API request)
Rejected: would reintroduce the same coupling to Horizon's request latency
as option A, just wrapped in a function, and would need its own mechanism
to avoid redundant re-fetching across concurrent invocations.
