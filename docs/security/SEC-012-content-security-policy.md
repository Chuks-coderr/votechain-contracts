# SEC-012: Content Security Policy (CSP)

| Field | Value |
|---|---|
| Record type | Security control |
| Date | Not recorded |
| Status | Implemented |
| Severity | Not assessed; priority is high |
| Affected components | `frontend/` |
| Reporter / reviewer | Not recorded |

Format: [SEC template](SEC-TEMPLATE.md).

---

## Overview

Without a CSP, an XSS bug (e.g. in a rendered proposal title or description) could inject
script and drain a connected wallet. The frontend now ships a strict CSP with **no
`'unsafe-inline'` and no `'unsafe-eval'`**.

## Policy

```
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data:;
connect-src 'self' <API_URL> https://horizon-testnet.stellar.org https://soroban-testnet.stellar.org;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests;
report-uri /csp-report;
report-to csp-endpoint
```

## Where it is set

| Location | Purpose |
|----------|---------|
| `frontend/deploy/nginx.conf` | **Authoritative** response header, incl. `frame-ancestors` and violation reporting |
| `frontend/index.html` `<meta http-equiv>` | Defence in depth for hosts that cannot set headers (meta CSP cannot use `report-uri`/`frame-ancestors`) |

For mainnet, replace the testnet Horizon/Soroban RPC origins and `API_URL` with the
production endpoints.

## Changes required for compliance

- The inline theme-initialisation `<script>` in `index.html` was moved to
  `frontend/public/theme-init.js`.
- The inline `style="…"` attribute on the retry button was replaced by the `.retry-btn` class.
- React `style={{…}}` props are applied via the CSSOM and are **not** blocked by `style-src 'self'`.

## Violation reporting

Browsers POST violation reports to `/csp-report`, which Nginx proxies to the backend.
Reports should be logged and alerted on; a spike indicates either a regression or an
attempted injection.

## Testing

1. `npm run build && npx vite preview` behind the Nginx config (or `docker compose up`).
2. Open DevTools → Console: there must be **no** `Refused to …` CSP errors during normal use
   (load proposals, connect Freighter, vote).
3. Inject a test payload (e.g. `<img src=x onerror=alert(1)>`) into a proposal description on a
   local network — it must be blocked and a report sent to `/csp-report`.
4. Validate the header with https://csp-evaluator.withgoogle.com/ — no high-severity findings.
