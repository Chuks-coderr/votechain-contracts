# ADR-015: Redis Caching Strategy (TTL-Based + Event-Driven Invalidation)

**Status:** Accepted
**Date:** 2026-09-29
**Issue:** [#77 — Write ADR for indexer and API architecture choices](https://github.com/veracindarella/votechain-contracts/issues/77)

## Context

`backend/` (the Node/Express service the frontend calls) serves proposal
and leaderboard reads that are read-heavy relative to write frequency —
proposals and votes change far less often than they're viewed. Hitting
Postgres (via the indexer's data, or `backend/`'s own queries) on every
request is unnecessary work for data that is frequently identical between
requests, especially for the proposal list and leaderboard endpoints.

At the same time, this is governance data: a vote that just landed, or a
proposal that just got finalized, should become visible to users promptly —
a long, purely time-based cache TTL would let stale results linger for as
long as the TTL window, which is a poor experience right after a state
change users are actively watching for (e.g. immediately after casting a
vote).

## Decision

`backend/src/middleware/redisCache.ts` implements a two-part strategy:

1. **TTL-based caching** on read endpoints via `cacheMiddleware`:
   - `GET /proposals` (list) — 30-second TTL (`PROPOSAL_LIST_TTL`)
   - `GET /proposals/:id` (item) — 10-second TTL (`PROPOSAL_ITEM_TTL`)
   - Leaderboard data (`leaderboardService.ts`) — 300-second TTL
     (`CACHE_TTL_SECONDS`)

   Shorter TTLs on more granular/individually-viewed data (single proposal)
   than on aggregate/list views reflects that list views are requested far
   more often (every page load) while carrying looser per-user freshness
   expectations than "did my vote register."

2. **Event-driven invalidation** layered on top: the indexer
   (`indexer/src/main.rs::call_invalidate`) fires a best-effort
   `POST {BACKEND_URL}/api/proposals/invalidate` immediately after
   ingesting any event that changes proposal state (`created`, `vote`,
   `final`, `executed`, `cancelled`), which calls
   `invalidateProposalCache(proposal_id)` — clearing both the list cache
   (`proposals:list*` via `scanIterator`) and the specific item's cache key.
   This collapses the effective staleness window from "up to the TTL" down
   to "up to one indexer poll interval" for the events that matter, while
   the TTL remains as a safety net for any state change invalidation
   doesn't catch (e.g. `backend/` restarting mid-flight, or the
   invalidation POST itself failing).

Resilience characteristics (tracked as issue #38 in code comments):

- If Redis is unreachable at `backend/` startup, the server still starts;
  caching is bypassed (`isRedisReady()` gates every cache read/write) until
  Redis recovers.
- Reconnection uses exponential backoff, capped at 5 attempts
  (`reconnectWithBackoff`).
- Cache degradation is observable via `GET /metrics/cache`
  (`redis_up`, hit/miss/invalidation counters).
- The invalidation POST from the indexer to `backend/` is itself
  fire-and-forget (`tokio::spawn` + logged warning on failure) — a failed
  invalidation never blocks or fails event ingestion; it only means that
  particular change relies on the TTL to eventually expire the stale entry.

## Consequences

- **Fast reads for the common case.** Repeated identical requests within
  the TTL window are served from Redis (`X-Cache: HIT`), avoiding a
  database round-trip.
- **Low staleness for the changes users care about**, without needing a
  very short blanket TTL (which would erase most of the caching benefit).
  A vote or finalization is reflected within roughly one indexer poll
  interval, not up to 30/10/300 seconds.
- **Two failure-independent freshness guarantees.** Even if the
  invalidation call is dropped (network blip, `backend/` momentarily down),
  the TTL bounds worst-case staleness; even if Redis itself is unavailable,
  the API still functions correctly (just uncached) rather than serving
  wrong data or erroring.
- **More moving parts and a cross-service dependency.** The indexer must
  know `backend/`'s URL (`BACKEND_URL` env var) and `backend/` must expose
  an admin-only invalidation route (`POST /proposals/invalidate`, gated by
  `adminAuth` in `backend/src/routes/proposals.ts`) purely for this
  internal purpose. If `BACKEND_URL` is misconfigured, the system doesn't
  break, but freshness silently degrades to TTL-only.
- **Cache-key scanning cost.** List invalidation uses
  `redis.scanIterator({ MATCH: "proposals:list*" })` to find and delete all
  list-view cache entries (which vary by query string), rather than a
  single fixed key — an O(keys) scan on every state-changing event. Cheap
  at current data volumes; worth revisiting (e.g. a secondary index of
  active list keys) if the number of distinct list query-string variants
  grows large.
- **No cross-instance coordination beyond Redis itself.** Multiple
  `backend/` replicas share the same Redis instance, so invalidation from
  one indexer event correctly clears the cache for all API replicas — this
  works because Redis is already a shared, external cache rather than
  in-process memory.

## Alternatives Considered

### A. Pure TTL caching, no event-driven invalidation
Rejected as the sole mechanism: would mean a just-cast vote or
just-finalized proposal could still read as stale for up to 30 seconds
(list) or 10 seconds (item) — acceptable for some applications, but a poor
fit for a governance UI where users expect to see their own vote reflected
promptly after submitting it.

### B. Pure event-driven invalidation, no TTL
Rejected as the sole mechanism: relies entirely on every possible mutation
path correctly firing an invalidation call. Any gap (a direct DB write
bypassing the indexer, a dropped invalidation POST, a future write path
that forgets to invalidate) would leave stale data cached indefinitely with
no self-healing. The TTL provides a bounded worst case independent of
whether invalidation logic is complete or currently working.

### C. No caching layer — always read through to Postgres
Rejected: proposal/leaderboard reads are frequent and the underlying data
changes comparatively rarely; skipping caching entirely trades a
meaningful latency and DB-load reduction for a freshness guarantee that
the TTL+invalidation combination already provides at acceptable staleness
levels.

### D. In-process (in-memory) caching per `backend/` instance instead of Redis
Rejected: `backend/` is expected to run as multiple replicas behind a load
balancer; in-process caches would be inconsistent across replicas (a
request hitting replica A wouldn't see an invalidation triggered by an
event handled while replica B served the cache), and would not survive
process restarts/deploys. A shared external cache (Redis) gives one
consistent cache state across all replicas.

### E. Push-based cache updates (write the new value into Redis on
invalidation, instead of deleting the key)
Deferred: would save the next request's cache-miss cost, but requires the
invalidation path to reconstruct the exact response shape the cache
middleware would have produced (including query-string-dependent list
pagination/filtering), which is significantly more complex than a
delete-and-let-the-next-request-repopulate approach for marginal benefit
at current traffic levels.
