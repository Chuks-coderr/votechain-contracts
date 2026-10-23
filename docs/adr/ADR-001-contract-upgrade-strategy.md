# ADR-001: Contract Upgrade Strategy

## Status
Accepted

## Context

The governance contract is deployed on Stellar's Soroban network with persistent state and active voting. Without an upgrade mechanism, any bug fix or feature requires:
1. Deploying a completely new contract to a new address
2. Migrating all state manually
3. Updating all clients to reference the new contract address
4. Losing the original contract's identity on-chain

This creates operational friction and increases the risk of state inconsistency.

## Decision

Implement an in-place contract upgrade capability via Soroban's `env.deployer().update_current_contract_wasm()` mechanism. This allows:
- Replacing the executable WASM code while preserving the contract address and all storage
- Admin-gated access to prevent unauthorized upgrades
- Event emission for audit trails
- Previous WASM hash recording for rollback capability

### Upgrade Function Signature

```rust
pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) -> Result<(), ContractError>
```

Only the admin may call this function. The new WASM code must already be uploaded to the Stellar network before calling this function.

### Storage Changes

- Add `PreviousWasmHash: BytesN<32>` to `DataKey` enum for rollback tracking
- Store the old WASM hash before upgrading

### Events

- Add `contract_upgraded` event emitting `(old_wasm_hash, new_wasm_hash)`
- Topics: `("upgrade",)`
- Allows indexers to track contract version changes

## Rationale

### Why Soroban's Native Upgrade?

Soroban provides `env.deployer().update_current_contract_wasm()` which is the idiomatic way to upgrade contracts without deploying new instances. This is safer than manual patterns because:
- The contract address remains constant
- All storage is preserved automatically
- The upgrade is atomic

### Why Admin-Gated?

Only the contract's admin should authorize upgrades to prevent:
- Unauthorized code execution
- Malicious function signature changes
- Instant surprise upgrades

### Why Record Previous Hash?

Storing the previous WASM hash enables:
- **Rollback**: Admin can re-invoke `upgrade()` with the old hash
- **Audit**: Indexers can track all version transitions
- **Recovery**: If the new code is buggy, the old code can be re-deployed

### No Timelock in This ADR

Issue #46 mentions a "minimum timelock" in acceptance criteria. This is deferred to allow emergency patches. A formal timelock mechanism (e.g., issue #42 "Timelock enforcement") should be implemented separately if required for security policy.

## Consequences

### Advantages
- Contracts can be patched in-place without re-deploying
- Contract address remains constant (important for indexers and client UIs)
- Rollback is possible if the upgrade is problematic
- Storage schema changes can be managed via migration functions

### Disadvantages
- Requires trust in the admin's upgrade procedures
- Storage migration bugs can leave the contract in an inconsistent state
- Rollback only works for WASM bugs, not storage schema incompatibilities

## Migration Strategy

### Additive Changes (Safe)
- Adding new optional fields to structs
- Adding new storage keys
- Adding new functions

**No migration needed**: Old contracts can upgrade and coexist with new code.

### Breaking Changes (Requires Migration)
- Removing fields from structs
- Changing field types
- Changing function signatures

**Migration function required**: After upgrading, call a migration function once to transform data before other transactions proceed.

## Implementation Notes

1. **Testing**: All upgrades must be tested on testnet first with the same steps as mainnet
2. **Versioning**: Update `get_version()` in contract after each upgrade
3. **Documentation**: Update `docs/upgrading.md` with the new `upgrade()` function
4. **Indexers**: Update indexer parsing to handle `contract_upgraded` events

## Related ADRs

- ADR-002 (if written): Timelock enforcement for critical operations
- ADR-003 (if written): Storage migration patterns

## References

- Soroban Documentation: https://developers.stellar.org/learn/soroban
- Contract Upgrade Guide: `docs/upgrading.md`
- GitHub Issue #46: Add upgrade path / contract wasm upgrade capability
