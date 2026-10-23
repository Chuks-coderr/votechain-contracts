# API Authentication — Admin Endpoints

VoteChain's backend API exposes a small number of **admin-only endpoints** that can mutate server state (e.g. invalidating the Redis cache after new on-chain events). These endpoints are protected by JWT-based authentication and per-IP rate limiting.

---

## Table of Contents

- [Overview](#overview)
- [Environment Variables](#environment-variables)
- [Obtaining an Admin JWT](#obtaining-an-admin-jwt)
- [Protected Endpoints](#protected-endpoints)
- [Rate Limits](#rate-limits)
- [Error Responses](#error-responses)
- [Example curl Commands](#example-curl-commands)

---

## Overview

Admin endpoints require a **Bearer token** in the `Authorization` header:

```
Authorization: Bearer <jwt>
```

The JWT is verified using HMAC-SHA256 against the `ADMIN_JWT_SECRET` environment variable. Its payload must contain a `stellarAddress` field that matches the `ADMIN_STELLAR_ADDRESS` environment variable — this ties the API-level admin to the same address that holds privileged access on-chain.

---

## Environment Variables

| Variable               | Required | Default      | Description                                                              |
|------------------------|----------|--------------|--------------------------------------------------------------------------|
| `ADMIN_JWT_SECRET`     | Yes      | `changeme`   | HMAC-SHA256 secret used to sign and verify admin JWTs. Change in prod.   |
| `ADMIN_STELLAR_ADDRESS`| Yes      | _(none)_     | The Stellar address that is the on-chain admin. Must match JWT payload.  |

> **Warning:** The default secret `changeme` is for local development only. Always set a strong, randomly-generated `ADMIN_JWT_SECRET` in staging and production.

---

## Obtaining an Admin JWT

Tokens are signed offline by whoever holds `ADMIN_JWT_SECRET`. There is no login endpoint — tokens are issued out-of-band (e.g. by a deployment script or a CI secret).

### Signing with Node.js

```js
const jwt = require("jsonwebtoken");

const token = jwt.sign(
  { stellarAddress: "GABC...XYZ" },   // must match ADMIN_STELLAR_ADDRESS
  process.env.ADMIN_JWT_SECRET,
  { expiresIn: "1h" }                  // recommended: short-lived tokens
);

console.log(token);
```

### Signing with the `jsonwebtoken` CLI

```bash
npx jwt-cli sign \
  --secret "$ADMIN_JWT_SECRET" \
  --payload '{"stellarAddress":"GABC...XYZ"}' \
  --expireIn 3600
```

### Token Payload

| Field            | Type     | Description                                     |
|------------------|----------|-------------------------------------------------|
| `stellarAddress` | `string` | Stellar address of the on-chain admin           |
| `exp`            | `number` | (optional) Expiry as Unix timestamp — recommended |
| `iat`            | `number` | (optional) Issued-at timestamp                  |

---

## Protected Endpoints

| Method | Path                    | Auth Required | Description                                         |
|--------|-------------------------|:-------------:|-----------------------------------------------------|
| `POST` | `/api/proposals/invalidate` | ✅ Yes    | Invalidate the Redis proposal cache (by id or all)  |
| `GET`  | `/api/proposals`            | ❌ No     | List proposals (public, cached 30 s)                |
| `GET`  | `/api/proposals/:id`        | ❌ No     | Get a single proposal (public, cached 10 s)         |
| `GET`  | `/api/metrics/cache`        | ❌ No     | Cache hit/miss metrics (public)                     |
| `GET`  | `/health`                   | ❌ No     | Liveness probe (public)                             |
| `GET`  | `/ready`                    | ❌ No     | Readiness probe (public)                            |

---

## Rate Limits

Admin endpoints enforce an **in-memory per-IP rate limit**:

| Limit       | Window     | Scope |
|-------------|------------|-------|
| 10 requests | 60 seconds | Per IP address |

The counter resets automatically after the 60-second window expires. There is no header advertising remaining quota — if you exceed the limit you will receive a `429` response (see below).

> **Note:** The rate limiter is in-memory and resets on server restart. For multi-instance deployments, consider replacing it with a Redis-backed rate limiter.

---

## Error Responses

All error responses share a consistent shape:

```json
{
  "error": {
    "code": "<ERROR_CODE>",
    "message": "<human-readable description>",
    "details": []
  }
}
```

| HTTP Status | `code`           | Cause                                                    |
|-------------|------------------|----------------------------------------------------------|
| `401`       | `UNAUTHORIZED`   | No `Authorization` header was provided                   |
| `401`       | `INVALID_TOKEN`  | JWT is malformed, uses the wrong secret, or has expired  |
| `403`       | `FORBIDDEN`      | JWT is valid but `stellarAddress` ≠ `ADMIN_STELLAR_ADDRESS` |
| `429`       | `RATE_LIMITED`   | More than 10 requests in the last 60 seconds from this IP |

---

## Example curl Commands

### Invalidate the entire proposal list cache

```bash
TOKEN=$(node -e "
  const jwt = require('jsonwebtoken');
  console.log(jwt.sign(
    { stellarAddress: process.env.ADMIN_STELLAR_ADDRESS },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: '5m' }
  ));
")

curl -X POST http://localhost:3001/api/proposals/invalidate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response:

```json
{ "ok": true, "invalidated": "list" }
```

### Invalidate a specific proposal by ID

```bash
curl -X POST http://localhost:3001/api/proposals/invalidate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "id": "42" }'
```

Expected response:

```json
{ "ok": true, "invalidated": "42" }
```

### Missing token (401)

```bash
curl -X POST http://localhost:3001/api/proposals/invalidate \
  -H "Content-Type: application/json" \
  -d '{}'
```

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing Authorization header",
    "details": []
  }
}
```

### Wrong stellarAddress (403)

```bash
# Token signed with the correct secret but wrong address
BAD_TOKEN=$(node -e "
  const jwt = require('jsonwebtoken');
  console.log(jwt.sign(
    { stellarAddress: 'GNOT_THE_ADMIN' },
    process.env.ADMIN_JWT_SECRET
  ));
")

curl -X POST http://localhost:3001/api/proposals/invalidate \
  -H "Authorization: Bearer $BAD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Caller is not the on-chain admin",
    "details": []
  }
}
```

---

## Security Notes

1. **Rotate `ADMIN_JWT_SECRET` regularly.** Compromised secrets cannot be revoked short of a server restart with a new secret.
2. **Use short-lived tokens.** Set `expiresIn` to 5–60 minutes for operational use.
3. **Never commit secrets.** Use environment-variable injection (e.g. GitHub Actions secrets, Kubernetes Secrets, AWS Secrets Manager).
4. **HTTPS only in production.** JWTs transmitted over HTTP are visible in transit.
