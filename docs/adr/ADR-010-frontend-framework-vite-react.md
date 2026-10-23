# ADR-010: Frontend framework — Vite + React + TypeScript

**Status:** Accepted
**Date:** 2026-09-27

## Context

VoteChain needs a web UI for browsing proposals, connecting a wallet, and casting votes. All authoritative state lives on-chain (Soroban contracts) or in the indexer/API, so the frontend is a thin client: it has no need for server-side rendering of private data, and it must be hostable as static files (IPFS, GitHub Pages, any CDN) to stay censorship-resistant and cheap to operate.

## Decision

Use **Vite** as the build tool with **React 18** and **TypeScript**, producing a static single-page application (see `frontend/package.json`).

## Consequences

- ✅ Fast dev server and HMR; minimal config (`frontend/vite.config.*`).
- ✅ Output is plain static assets — deployable anywhere, no Node server to run or secure.
- ✅ React has the largest ecosystem and contributor pool; Stellar/Freighter examples are React-first.
- ✅ TypeScript catches contract-type mismatches (`frontend/src/types.ts`) at compile time.
- ⚠️ No SSR: first paint depends on client JS; SEO is limited (acceptable for a dApp).
- ⚠️ Routing, data fetching and caching must be assembled by hand rather than provided by a meta-framework.

## Alternatives

| Option | Why not chosen |
|--------|----------------|
| Next.js | SSR/server features unused; requires a Node runtime or careful static export; heavier build. |
| SvelteKit | Smaller ecosystem and contributor familiarity; fewer Stellar wallet examples. |
| Create React App | Deprecated/unmaintained; slow builds compared to Vite. |
| Vue + Vite | Viable, but team and ecosystem familiarity favoured React. |
