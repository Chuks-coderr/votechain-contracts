# API Keys — Verified-DAO Tier

VoteChain offers a **verified-DAO tier** for organisations running high-activity governance events. A DAO API key raises rate limits significantly and unlocks additional response headers for traffic monitoring.

---

## Table of Contents

- [Overview](#overview)
- [Rate Limits](#rate-limits)
- [Registering for an API Key](#registering-for-an-api-key)
- [Using Your API Key](#using-your-api-key)
- [Key Management](#key-management)
  - [Create a key](#create-a-key)
  - [Inspect a key](#inspect-a-key)
  - [Rotate a key](#rotate-a-key)
  - [Reinstate a suspended key](#reinstate-a-suspended-key)
  - [Revoke a key](#revoke-a-key)
- [Abuse Detection & Suspension](#abuse-detection--suspension)
- [Response Headers](#response-headers)
- [Error Reference](#error-reference)
- [Environment Variables](#environment-variables)
- [Security Notes](#security-notes)

---

## Overview

All `/api` endpoints accept an optional `Authorization: Bearer` header.

| Token type | Detection | Tier |
|---|---|---|
| No header | — | `anon` |
| `Bearer vc_…` | Starts with `vc_` → API key path | `api_key` |
| `Bearer <JWT>` | Does not start with `vc_` → admin JWT path | (passed to `adminAuth`) |

---

## Rate Limits

| Tier | Read (GET/HEAD) | Write (POST/PUT/PATCH/DELETE) |
|---|---|---|
| Anonymous | **100 req/min** per IP | **10 req/min** per IP |
| API key | **1 000 req/min** per key | **100 req/min** per key |

Read and write limits are tracked independently using separate Redis counters.

All limits can be overridden with environment variables (see [Environment Variables](#environment-variables)).

---

## Registering for an API Key

API key provisioning is an **admin-only** operation.  A team member with the admin JWT must call the create endpoint on your behalf and securely deliver the resulting raw key.

1. Contact your VoteChain administrator or follow your organisation's internal request process.
2. Provide:
   - Your DAO's Stellar address (`owner`)
   - A human-readable label (`label`) to identify the key in logs
3. The administrator creates the key via the management API and sends you the raw key **once** — store it immediately in a secrets manager (e.g. AWS Secrets Manager, HashiCorp Vault, GitHub Actions Secrets).

> **The raw key is never stored by VoteChain.** Only a SHA-256 hash is kept on the server. If you lose the raw key, rotate it to receive a new one.

---

## Using Your API Key

Pass the raw key in the `Authorization` header on every request:

```
Authorization: Bearer vc_4a3b2c1d…
```

### curl example

```bash
export VC_API_KEY="vc_4a3b2c1d..."

curl -H "Authorization: Bearer $VC_API_KEY" \
     https://api.votechain.dev/api/proposals
```

### JavaScript / TypeScript

```typescript
const BASE_URL = "https://api.votechain.dev";
const API_KEY  = process.env.VC_API_KEY!; // loaded from environment / secrets

async function listProposals() {
  const res = await fetch(`${BASE_URL}/api/proposals`, {
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
    },
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`${res.status}: ${err.error.code}`);
  }

  return res.json();
}
```

---

## Key Management

All key management endpoints are **admin-only** (require a valid admin JWT — see [docs/api-auth.md](api-auth.md)).

### Create a key

```
POST /api/keys
Authorization: Bearer <admin JWT>
Content-Type: application/json

{
  "owner": "<Stellar address of the DAO>",
  "label": "<human-readable label, max 128 chars>"
}
```

**Response 201:**

```json
{
  "key": "vc_4a3b2c1d...",
  "meta": {
    "id": "a1b2c3d4e5f6...",
    "owner": "GABC...XYZ",
    "label": "My DAO Production Key",
    "createdAt": "2024-09-30T07:00:00.000Z",
    "status": "active",
    "keyPrefix": "vc_4a3b"
  }
}
```

> The `key` field is returned **once only**. Store it immediately.

---

### Inspect a key

```
GET /api/keys/:id
Authorization: Bearer <admin JWT>
```

**Response 200:**

```json
{
  "meta": {
    "id": "a1b2c3d4e5f6...",
    "owner": "GABC...XYZ",
    "label": "My DAO Production Key",
    "createdAt": "2024-09-30T07:00:00.000Z",
    "status": "active",
    "keyPrefix": "vc_4a3b"
  }
}
```

The raw key is never included in metadata responses.  Use `keyPrefix` to identify which key this is when communicating with the DAO team.

---

### Rotate a key

Rotation invalidates the current key immediately and issues a new one.

```
POST /api/keys/:id/rotate
Authorization: Bearer <admin JWT>
```

**Response 200:**

```json
{
  "key": "vc_9f8e7d6c...",
  "meta": { "status": "active", ... }
}
```

When to rotate:
- Suspected credential leak
- Periodic rotation cadence (e.g. every 90 days)
- After a security incident

> The old key stops working the instant this call succeeds. Update your secrets store before rotating in production.

---

### Reinstate a suspended key

```
POST /api/keys/:id/reinstate
Authorization: Bearer <admin JWT>
```

**Response 200:**

```json
{
  "ok": true,
  "meta": { "status": "active", ... }
}
```

A key must be in `suspended` status. Returns `409 KEY_NOT_SUSPENDED` otherwise.

---

### Revoke a key

Revocation is **permanent**. The key cannot be reactivated.

```
DELETE /api/keys/:id
Authorization: Bearer <admin JWT>
```

**Response 200:**

```json
{ "ok": true }
```

When to revoke:
- The DAO no longer needs API access
- A key has been compromised and you want to deny all future requests (even with the raw key)

After revocation, create a new key if the DAO still needs access.

---

## Abuse Detection & Suspension

The rate-limit middleware tracks the **combined** (read + write) request volume per key per minute.  If this total exceeds the `ABUSE_BURST_THRESHOLD` (default **1 500 req/min**), the key is automatically suspended:

1. The key is immediately marked `suspended` in Redis.
2. All subsequent requests with that key return `403 SUSPENDED_KEY`.
3. The current over-limit request still receives a `429 RATE_LIMITED` response.
4. An admin must manually call `POST /api/keys/:id/reinstate` to restore access.

The threshold is intentionally set 50 % above the combined read+write maximum (1 000 + 100 = 1 100) to allow for legitimate burst activity while catching anomalous patterns.

### What triggers suspension?

- Runaway client loops or retry storms
- Key compromise and abuse by a third party
- Misconfigured clients sending traffic at 10× expected rate

### Responding to a suspension

1. Investigate traffic logs for the affected key ID.
2. If traffic was legitimate, increase `ABUSE_BURST_THRESHOLD` and reinstate.
3. If the key was compromised, rotate it, then reinstate (or simply revoke it and create a new one for the DAO).

---

## Response Headers

Every `/api` response includes rate-limit headers:

| Header | Description |
|---|---|
| `X-RateLimit-Tier` | `anon` or `api_key` |
| `X-RateLimit-Limit` | Maximum requests allowed in this window |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the window resets |

---

## Error Reference

| HTTP | `error.code` | Cause |
|---|---|---|
| `401` | `INVALID_API_KEY` | Unknown `vc_` token (never issued, or revoked and lookup cleaned up) |
| `401` | `REVOKED_KEY` | Token resolves to a record with `status: revoked` (partial-failure edge case) |
| `403` | `SUSPENDED_KEY` | Key has been automatically or manually suspended |
| `429` | `RATE_LIMITED` | Rate limit exceeded for this tier and method type |
| `404` | `KEY_NOT_FOUND` | Management endpoint: no key with that ID |
| `409` | `KEY_REVOKED` | Attempted to rotate a revoked key |
| `409` | `KEY_NOT_SUSPENDED` | Attempted to reinstate a key that is not suspended |
| `503` | `SERVICE_UNAVAILABLE` | Redis unavailable (management operations require Redis) |

All error responses follow the same shape:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many read requests. Limit: 1000/min.",
    "details": []
  }
}
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ANON_READ_LIMIT` | `100` | Anonymous tier read requests per minute |
| `ANON_WRITE_LIMIT` | `10` | Anonymous tier write requests per minute |
| `API_KEY_READ_LIMIT` | `1000` | API-key tier read requests per minute |
| `API_KEY_WRITE_LIMIT` | `100` | API-key tier write requests per minute |
| `ABUSE_BURST_THRESHOLD` | `1500` | Combined req/min above which a key is auto-suspended |

These variables can be set per-environment in `.env` (see `.env.example`).

---

## Security Notes

1. **Store keys in a secrets manager.** Never commit raw keys to source control. Use GitHub Actions Secrets, AWS Secrets Manager, HashiCorp Vault, or an equivalent.

2. **Rotate keys periodically.** Even if no compromise is suspected, rotate on a regular cadence (e.g. every 90 days).

3. **Keys are one-way hashed.** VoteChain stores only a SHA-256 digest of the raw key. Neither the VoteChain team nor an attacker with read access to Redis can recover a raw key.

4. **Revocation is immediate.** Revoking a key removes its lookup entry from Redis so all future requests using that key are rejected before any application logic runs.

5. **HTTPS only in production.** Bearer tokens transmitted over plain HTTP are visible in transit. Always terminate TLS at the load balancer or ingress.

6. **Key prefix for identification.** The first 8 characters of the raw key (`keyPrefix`) are stored in metadata. Use this to identify which key belongs to which DAO team when communicating out-of-band, without exposing the full key.
