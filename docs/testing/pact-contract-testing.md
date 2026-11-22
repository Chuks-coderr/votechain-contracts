# Consumer-Driven Contract Testing (SDK ↔ Backend)

**Issue:** #308 — "Add API contract tests between backend and SDK"
**Status:** Phase 1 (proposal-read endpoints) implemented; CI gate and
vote-endpoint coverage are follow-up work, documented below.

## Why

The SDK (`sdk/`) and the backend (`backend/`) are separately versioned
packages in the same repo. Nothing currently prevents the backend from
changing a response shape (field renamed, type changed, pagination format
altered) without the SDK's expectations being updated in lockstep, other than
manual review. [Pact](https://docs.pact.io/) consumer-driven contract tests
close that gap: the consumer (SDK) defines the interactions it expects, the
tests run against a Pact mock server to produce a "pact file," and that pact
file can later be replayed against the real provider (backend) to verify it
still honours the contract.

## What is covered today

`sdk/src/__contract__/proposals.pact.spec.ts` defines Pact interactions for
the two HTTP endpoints the backend actually exposes for proposals, per
`backend/src/routes/proposals.ts`:

- `GET /proposals` — list endpoint, verified against the `{ data: [...],
  pagination: {...} }` shape returned by the route's cursor-pagination logic.
- `GET /proposals/:id` — single-proposal lookup, verified against the `{ id
  }` shape the stub handler currently returns.

## What is explicitly *not* covered yet, and why

The issue's acceptance criteria mention "proposal and vote endpoints."
Auditing `backend/src/routes/` (see the directory listing below) found **no
HTTP vote endpoint**:

```
backend/src/routes/
  analytics.ts  apiKeys.ts  csv.ts  health.ts  keys.ts
  leaderboard.ts  proposals.ts  simulate.ts  webhooks.ts
```

Voting in VoteChain happens by calling the Soroban governance contract
directly — the SDK's `GovernanceClient` (`sdk/src/client.ts`) builds and signs
a transaction against the contract, it is not proxied through a backend REST
endpoint. There is therefore no backend HTTP contract to write for "vote" yet.
If/when a backend vote-submission or vote-status endpoint is added, add a
corresponding Pact interaction here following the same pattern as the
proposal endpoints above — that is a natural first extension of this file
rather than a new mechanism.

## Running the contract tests

The contract tests depend on `@pact-foundation/pact`, declared in
`sdk/package.json` `devDependencies` but intentionally **not** bundled into
the default `npm test` run:

- `sdk/vitest.config.ts` only includes `src/**/*.test.ts`.
- The contract spec is named `proposals.pact.spec.ts` (not `*.test.ts`) and
  has its own config, `sdk/vitest.contract.config.ts`, which includes
  `src/**/*.pact.spec.ts`.
- Run it explicitly with `npm --prefix sdk run test:contract`.

This keeps `npm test` dependency-free of Pact for contributors who only touch
unrelated SDK code, while still making the contract tests a first-class,
runnable suite.

## CI wiring (follow-up, not yet done)

The acceptance criteria ask for:

> Contract test failures block merge to main

This is **not yet wired into CI** as part of this change. Adding a new
required status check (a `pact-contract` job in a workflow, analogous to how
`enforce-severity-gate` blocks on CodeQL findings — see
`docs/security/sast-scanning.md`) changes branch-protection requirements for
the whole repository and should be reviewed/approved by a maintainer with
admin access rather than added unilaterally in a contributor PR. The
recommended follow-up:

1. Add a `pact.yml` workflow (or a job in the SDK's existing CI workflow)
   that runs `npm --prefix sdk ci && npm --prefix sdk run test:contract`.
2. Publish the resulting pact file as a build artifact (or to a Pact Broker,
   if one is stood up) so the backend side can eventually verify against it
   in its own CI job (provider verification), not just generate it.
3. Mark the new job as a required status check once it has run clean on a
   few PRs, mirroring how `enforce-severity-gate` was adopted for CodeQL.

## Backend ↔ Indexer contract testing (issue #528)

The backend also consumes the indexer's REST API. A separate Pact contract
covers that consumer/provider pair so a breaking change in the indexer API is
caught before deploy.

### What interaction is covered

The backend acts as the Pact **consumer** and the indexer as the **provider**.
The contract lives in `backend/src/__contract__/indexer.pact.spec.ts` and
defines the interaction the backend relies on when reading indexed data:

- `GET /events` — the indexer's event listing endpoint, verified against the
  `{ data: [...], pagination: { cursor, hasMore } }` shape the backend's
  indexer client parses. The interaction pins the request (query params such
  as `contractId`/`cursor`/`limit`) and the response body/status so a renamed
  field, changed type, or altered pagination format fails the contract.

If the backend starts consuming additional indexer endpoints, add a matching
interaction to the same spec following the existing pattern rather than
introducing a new mechanism.

### Running the contract test

The contract spec depends on `@pact-foundation/pact`, declared in
`backend/package.json` `devDependencies` but intentionally **not** part of the
default `npm test` run:

- The default backend test config only includes `*.test.ts`.
- The contract spec is named `indexer.pact.spec.ts` (not `*.test.ts`) and has
  its own config, `backend/vitest.contract.config.ts`, which includes
  `src/**/*.pact.spec.ts`.
- Run it explicitly with `npm --prefix backend run test:contract`.

This keeps `npm test` free of Pact for contributors who only touch unrelated
backend code, while making the contract test a first-class, runnable suite.

### How the pact is stored / published

Running the contract test writes the generated pact file to
`backend/pacts/backend-indexer.json` (the consumer/provider directory is
configured in the spec). The file is:

1. Committed alongside the spec so drift is visible in review diffs, and
2. Uploaded as a CI build artifact on every run, so the provider side can
   fetch the exact pact version that was generated for a given commit.

If a Pact Broker is stood up later, the spec's `pactBrokerUrl` /
`publishVerificationResults` options can be enabled to publish the pact and
verification results there instead of relying on the committed file and
artifacts.

### Provider verification

The indexer side verifies the pact against its real implementation. The
provider verification test replays each interaction in
`backend/pacts/backend-indexer.json` against the indexer's running API (or an
in-process app instance) and fails if the actual response no longer matches
the contract. This is what turns the consumer-defined contract into an
enforced guarantee: the consumer test catches the backend's expectations
drifting, and the provider verification catches the indexer breaking them.

### CI gating

A `pact-contract` job runs both sides on every PR:

1. `npm --prefix backend ci && npm --prefix backend run test:contract` —
   generates the pact and fails on consumer-side drift.
2. Provider verification against the indexer — fails on provider-side drift.
3. The generated pact file is uploaded as a build artifact.

The job is intended to be marked as a required status check once it has run
clean on a few PRs, mirroring how `enforce-severity-gate` was adopted for
CodeQL (see `docs/security/sast-scanning.md`). Until then it runs and reports
but does not block merge.

## References

- `sdk/src/__contract__/proposals.pact.spec.ts` — the SDK ↔ backend contract test
- `backend/src/__contract__/indexer.pact.spec.ts` — the backend ↔ indexer contract test
- `backend/pacts/backend-indexer.json` — generated pact file for the indexer contract
- `backend/src/routes/proposals.ts` — the provider endpoints under contract
- `sdk/src/client.ts` — why there is no HTTP vote endpoint to contract-test
- [Pact docs](https://docs.pact.io/)
- Issue #308, Issue #528
