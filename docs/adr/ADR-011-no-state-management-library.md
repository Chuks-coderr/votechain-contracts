# ADR-011: No dedicated state management library (React Context API)

**Status:** Accepted
**Date:** 2026-09-27

## Context

Client-side state in the VoteChain UI is small: the connected wallet (address, network, connection status) and the list/detail of proposals fetched from the API or contract. The source of truth is on-chain; the UI largely mirrors it.

## Decision

Use React's built-in **Context API + hooks** instead of a state library. State is split into focused providers: `frontend/src/context/WalletContext.tsx` and `frontend/src/context/ProposalContext.tsx`, with reusable logic in `frontend/src/hooks/`.

## Consequences

- ✅ Zero extra dependencies — smaller bundle and smaller supply-chain surface.
- ✅ Lower learning curve for contributors; plain React patterns.
- ✅ Separate contexts keep re-renders scoped to the consumers of each slice.
- ⚠️ No built-in devtools, time-travel debugging, or request caching/deduplication.
- ⚠️ If global state grows significantly (e.g. multiple wallets, optimistic updates, offline cache) this should be revisited — a new ADR would supersede this one.

## Alternatives

| Option | Why not chosen |
|--------|----------------|
| Redux Toolkit | Boilerplate and bundle cost not justified for two small slices of state. |
| Zustand / Jotai | Lightweight, but still an extra dependency for little gain today. |
| TanStack Query | Strong for server-state caching; deferred until API usage justifies it. |
