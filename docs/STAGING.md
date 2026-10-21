# Staging environment

This repository includes a dedicated `staging` environment for integration testing before mainnet. (#67)

- Config: [config/staging.toml](config/staging.toml#L1)
- Deploy script: `scripts/deploy_staging.sh` — wrapper that calls `scripts/deploy.sh` with `NETWORK=staging`, then
  writes the resulting contract IDs into both `.env.staging` and `config/staging.toml`.
- Smoke test script: `scripts/smoke_test_staging.sh` — exercises the full proposal lifecycle
  (initialise → create proposal → cast vote → finalise) against the freshly deployed contracts,
  using a fresh keypair funded from the Stellar testnet friendbot.
- CI workflow: [`.github/workflows/deploy-staging.yml`](../.github/workflows/deploy-staging.yml) —
  runs the deploy script and the smoke test automatically on every merge to `develop`.

Usage:

1. Edit `config/staging.toml` and set `rpc_url` and `network_passphrase` for your staging Soroban network.
2. Run the deploy script:

```bash
chmod +x ./scripts/deploy_staging.sh
./scripts/deploy_staging.sh
```

The deploy script writes contract IDs to `.env.staging`.

## Logging and Log Rotation

Staging containers use the same `json-file` rotation as local development
(`docker-compose.yml`, 100MB × 5 files per service). In addition, the staging deployment ships
logs to the same centralised backend (Loki or CloudWatch Logs) used for production, but with a
shorter **7-day retention** window. See [logging.md](logging.md) for driver configuration and
retention setup.
