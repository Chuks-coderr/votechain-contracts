# API Reference

VoteChain exposes two API surfaces:

| Service | Description | Base URL |
|---------|-------------|----------|
| **Node.js backend** | Proposal reads + cache control | `http://localhost:3001` |
| **Rust indexer** | On-chain event data | `http://localhost:3000` (default) |

The complete OpenAPI 3.1 specification lives at [`api/openapi.yml`](../api/openapi.yml).

---

## Swagger UI (Development)

In development mode the Swagger UI is served at **`/docs`** on the backend server.

Start the backend with the `ENABLE_SWAGGER` flag:

```bash
cd backend
ENABLE_SWAGGER=true npm run dev
# Open http://localhost:3001/docs
```

---

## Authentication

Read-only endpoints (`GET`) require no authentication in the current release.

The cache-invalidation endpoint (`POST /api/proposals/invalidate`) is intended for
internal use by the event indexer. Protect it at the network or reverse-proxy layer.
A future release may require an `Authorization: Bearer <token>` header on mutating
endpoints.

---

## Endpoints at a Glance

### Node.js Backend (`/api/…`)

| Method | Path | Description | Cached |
|--------|------|-------------|--------|
| `GET` | `/api/proposals` | List proposals (paginated) | 30 s |
| `GET` | `/api/proposals/:id` | Get proposal detail | 10 s |
| `POST` | `/api/proposals/invalidate` | Evict proposal from Redis cache | — |
| `GET` | `/api/metrics/cache` | Redis cache hit/miss counters | — |

### Rust Indexer (`/…`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/proposals` | List proposals |
| `GET` | `/proposals/:id` | Get proposal detail |
| `GET` | `/proposals/:id/votes` | List votes for a proposal |
| `GET` | `/voters/:address/votes` | Vote history for a Stellar address |

---

## Query Parameters — `GET /api/proposals`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `offset` | integer | `0` | Skip this many proposals (pagination) |
| `limit` | integer | `50` | Max results, capped at `50` |
| `state` | string | — | Filter by state: `active`, `passed`, `rejected`, `executed`, `cancelled` |

---

## Common Response Schemas

### `ProposalSummary`

```json
{
  "id": 42,
  "title": "Increase Treasury Allocation",
  "state": "active",
  "quorum": 5000000,
  "start_time": 1700000000,
  "end_time": 1700604800
}
```

### `ProposalDetail`

```json
{
  "id": 42,
  "proposer": "GXXX...",
  "title": "Increase Treasury Allocation",
  "description": "Allocate 10M tokens from the treasury to fund development.",
  "quorum": 5000000,
  "votes_yes": 3000000,
  "votes_no": 500000,
  "votes_abstain": 1500000,
  "start_time": 1700000000,
  "end_time": 1700604800,
  "state": "passed",
  "execute_after": 1700691200
}
```

### `VoteRecord`

```json
{
  "proposal_id": 42,
  "voter": "GXXX...",
  "vote": "yes",
  "weight": 1000000
}
```

### `ApiError`

```json
{
  "code": "NOT_FOUND",
  "message": "Proposal 42 not found"
}
```

---

## Caching

Proposal responses are cached in Redis:

- **Proposal list** — 30-second TTL (`proposals:list`)
- **Single proposal** — 10-second TTL (`proposals:item:<id>`)

The `X-Cache` response header is `HIT` or `MISS`.

Cache entries are evicted proactively when the event indexer calls
`POST /api/proposals/invalidate`.

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `NOT_FOUND` | 404 | The requested resource does not exist |
| `INVALID_PARAM` | 400 | A query or path parameter is invalid |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## OpenAPI Spec

The full machine-readable spec is at [`api/openapi.yml`](../api/openapi.yml).
Import it into Postman, Insomnia, or any OpenAPI-compatible tool.

To validate the spec locally (requires [Spectral](https://github.com/stoplightio/spectral)):

```bash
npm install -g @stoplight/spectral-cli
spectral lint api/openapi.yml
```
