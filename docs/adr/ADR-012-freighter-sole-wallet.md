# ADR-012: Freighter as the sole wallet integration target

**Status:** Accepted
**Date:** 2026-09-27

## Context

Voting and proposal creation require the user to sign Soroban transactions (`voter.require_auth()` in `contracts/governance/src/lib.rs`). The UI must integrate at least one Stellar wallet that supports Soroban auth entries and testnet/mainnet switching.

## Decision

Integrate **Freighter** only, via `frontend/src/components/FreighterWallet.tsx` and `frontend/src/context/WalletContext.tsx`.

## Consequences

- ✅ Freighter is maintained by SDF and has first-class Soroban signing support.
- ✅ One integration path means less code, a smaller test matrix, and fewer security-sensitive dependencies.
- ✅ Network detection lets the UI warn when the wallet network does not match the deployment.
- ⚠️ Users of other wallets (xBull, Albedo, Lobstr, Ledger hardware) cannot vote through the UI; they must use the Stellar CLI or another client.
- ⚠️ Browser-extension only — no native mobile support.
- Follow-up: revisit once a multi-wallet adapter (e.g. Stellar Wallets Kit) is mature; that would be a new ADR superseding this one.

## Alternatives

| Option | Why not chosen |
|--------|----------------|
| Stellar Wallets Kit (multi-wallet) | Broader reach, but larger surface area and more flows to test and audit at this stage. |
| Albedo | Web-based signer; less Soroban-focused tooling at decision time. |
| xBull | Good Soroban support but smaller user base. |
| WalletConnect | Stellar support still maturing; adds relay infrastructure dependency. |
