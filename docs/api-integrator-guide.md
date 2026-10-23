# API Integration Guide

This guide is for applications that call the VoteChain API. The complete endpoint
definitions are in the [OpenAPI specification](../api/openapi.yml).

## Request an API key

Public read endpoints can be called without a key. A verified-DAO API key raises
the request limits for an integration. Keys are provisioned by a VoteChain
administrator; there is no public self-service key endpoint.

Contact your DAO's VoteChain administrator and provide the DAO's Stellar address
and a label that identifies the integration. The administrator will create the
key and deliver its raw value securely. Store it in a secrets manager or an
environment variable. The raw key is shown only once and must not be committed to
source control or exposed in browser code.

## Send the key

Include the key as a Bearer token in the `Authorization` header on each request.
For example, list proposals with:

```bash
export VC_API_KEY="vc_your_key"

curl --include "https://api.votechain.dev/api/proposals" \
  -H "Authorization: Bearer $VC_API_KEY"
```

The JavaScript example uses a server-side environment variable. Do not put a
private API key in a client-side web application.

```javascript
const response = await fetch("https://api.votechain.dev/api/proposals", {
  headers: { Authorization: `Bearer ${process.env.VC_API_KEY}` },
});

if (!response.ok) {
  const body = await response.json();
  throw new Error(`${response.status} ${body.error?.code ?? "API_ERROR"}`);
}

const proposals = await response.json();
```

```python
import os
import requests

response = requests.get(
    "https://api.votechain.dev/api/proposals",
    headers={"Authorization": f"Bearer {os.environ['VC_API_KEY']}"},
    timeout=15,
)

if not response.ok:
    body = response.json()
    raise RuntimeError(
        f"{response.status_code} {body.get('error', {}).get('code', 'API_ERROR')}"
    )

proposals = response.json()
```

## Rate limits

Limits are applied per minute and differ by request method:

| Tier | Read requests | Write requests |
|---|---:|---:|
| Anonymous | 100 per IP | 10 per IP |
| API key | 1,000 per key | 100 per key |

Each `/api` response includes these headers:

| Header | Meaning |
|---|---|
| `X-RateLimit-Tier` | `anon` or `api_key` |
| `X-RateLimit-Limit` | Request limit for this tier and method |
| `X-RateLimit-Remaining` | Requests left in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |

Limits may be configured differently by the service operator. Check the headers
instead of hard-coding a limit. When a request returns `429`, pause until the
window resets, then retry with exponential backoff and jitter. Avoid immediate
or unbounded retries. The API does not currently provide a `Retry-After` header.

## Authentication and rate-limit errors

Error responses use the shape `{"error":{"code":"...","message":"...","details":[]}}`.

| HTTP | Code | What to do |
|---|---|---|
| `401` | `INVALID_API_KEY` | Check that the full key is current and correctly supplied as a Bearer token. Ask the administrator to issue a replacement if it was revoked or lost. |
| `401` | `REVOKED_KEY` | The key is revoked and cannot be restored. Ask the administrator to create a replacement and update the secret used by the integration. |
| `403` | `SUSPENDED_KEY` | Stop retrying and contact the administrator to review the key's traffic and reinstate it if appropriate. |
| `429` | `RATE_LIMITED` | Reduce request frequency, wait for `X-RateLimit-Reset`, and retry with backoff. |

For key issuance, rotation, and operator-side management, see the
[API keys reference](api-keys.md). For endpoint details, see the
[OpenAPI specification](../api/openapi.yml).