# VoteChain Stellar Protocol Compatibility Matrix

This document tracks VoteChain version compatibility with Stellar protocol versions and Soroban SDK releases.

## Compatibility Matrix

| VoteChain Version | Soroban SDK | Stellar Protocol | Status | End of Life |
|---|---|---|---|---|
| 1.0.x | 22.8.0+ | 21+ | ✅ Supported | TBD |
| 1.1.x | 23.0.0+ | 21+ | ⚠️ In Development | TBD |

## Breaking Changes by Protocol Version

### Stellar Protocol 21
- Initial Soroban support (Soroban protocol 20)
- VoteChain 1.0.0 stable release
- No breaking changes to VoteChain

### Stellar Protocol 22
- Soroban protocol 21 enhancements
- VoteChain 1.0.x maintains compatibility
- Recommended for new deployments

## Upgrade Path

### From VoteChain 1.0.x to 1.1.x
- Contract storage optimizations in place
- No state migration needed for immutable proposal history
- Vote tallies maintained across protocol versions

## SDK and Tooling Requirements

| Component | Minimum | Tested | Recommended |
|---|---|---|---|
| Stellar CLI | 22.8.2 | 22.8.2 | 22.8.2+ |
| Rust | 1.70.0 | 1.79.0 | 1.79.0+ |
| Node.js (Backend) | 16.0.0 | 18.20.0 | 18.20.0+ |
| soroban-sdk | 22.8.0 | 22.8.0 | 22.8.0+ |

## Testing Against Protocol Versions

All releases are tested against:
- Stellar Testnet (current protocol)
- Stellar Public Network (stable protocol)
- Local Stellar Node (isolated testing)

The CI/CD pipeline (`stellar-protocol-compat.yml`) automatically verifies contract builds and execution compatibility against the target SDK version.

## Known Limitations

- Token balances captured at proposal creation are not retroactively adjusted for protocol upgrades
- Storage cost estimates should be re-validated when upgrading between Stellar protocol versions

## Reporting Compatibility Issues

If you encounter protocol compatibility issues:
1. Document the VoteChain version, Stellar protocol, and error message
2. Test on Testnet before reporting
3. Create an issue with the "protocol-compatibility" label

## Migration Guide

Detailed migration guides for each VoteChain version are available in the deployment documentation.
