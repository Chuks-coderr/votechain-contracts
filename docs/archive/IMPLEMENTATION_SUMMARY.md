# Voting Duration Limits Implementation Summary

## Overview
Implemented configurable minimum and maximum voting duration limits for the governance contract, replacing hardcoded constants with dynamic, admin-updatable configuration stored in contract storage.

## Changes Made

### 1. **Types & Storage Keys** (`contracts/governance/src/types.rs`)
Added two new storage key variants to the `DataKey` enum:
- `MinDuration` – Stores minimum allowed voting duration in seconds (instance storage)
- `MaxDuration` – Stores maximum allowed voting duration in seconds (instance storage)

Both are singleton configuration values stored in instance storage for efficient access.

### 2. **Storage Functions** (`contracts/governance/src/storage.rs`)
Added four new storage accessor functions:

```rust
pub fn set_min_duration(env: &Env, v: u64)
pub fn get_min_duration(env: &Env) -> u64  // defaults to 60 seconds
pub fn set_max_duration(env: &Env, v: u64)
pub fn get_max_duration(env: &Env) -> u64  // defaults to 2,592,000 seconds (30 days)
```

These functions follow the existing storage pattern and provide sensible defaults matching the original hardcoded constants.

### 3. **Contract Initialization** (`contracts/governance/src/lib.rs`)
Updated the `initialize()` function signature to accept two new parameters:
- `min_duration: u64` – Minimum voting duration in seconds (e.g., 3600 for 1 hour)
- `max_duration: u64` – Maximum voting duration in seconds (e.g., 2592000 for 30 days)

The function now stores these limits in contract storage during initialization.

**Before:**
```rust
pub fn initialize(
    env: Env,
    admin: Address,
    voting_token: Address,
    min_proposal_balance: i128,
    proposal_cooldown: u64,
    restrict_admin_vote: bool,
) -> Result<(), ContractError>
```

**After:**
```rust
pub fn initialize(
    env: Env,
    admin: Address,
    voting_token: Address,
    min_proposal_balance: i128,
    proposal_cooldown: u64,
    min_duration: u64,
    max_duration: u64,
    restrict_admin_vote: bool,
) -> Result<(), ContractError>
```

### 4. **Proposal Creation Validation** (`contracts/governance/src/lib.rs`)
Updated `create_proposal()` to use configurable duration limits instead of hardcoded constants:

**Before:**
```rust
const MIN_DURATION: u64 = 60;        // 1 minute
const MAX_DURATION: u64 = 2_592_000; // 30 days

if duration < MIN_DURATION || duration > MAX_DURATION {
    return Err(ContractError::InvalidDurationRange);
}
```

**After:**
```rust
let min_duration = get_min_duration(&env);
let max_duration = get_max_duration(&env);
if duration < min_duration || duration > max_duration {
    return Err(ContractError::InvalidDurationRange);
}
```

### 5. **Admin Function to Update Limits** (`contracts/governance/src/lib.rs`)
Added new admin-only function to update duration limits after initialization:

```rust
pub fn update_duration_limits(
    env: Env,
    admin: Address,
    min_duration: u64,
    max_duration: u64,
) -> Result<(), ContractError>
```

**Features:**
- Admin authentication required
- Respects contract pause state
- Emits event on successful update
- Allows dynamic adjustment of voting duration constraints

### 6. **Query Functions** (`contracts/governance/src/lib.rs`)
Added two read-only query functions for transparency:

```rust
pub fn min_duration(env: Env) -> u64
pub fn max_duration(env: Env) -> u64
```

These allow external callers to query the current duration limits without reverting.

### 7. **Event Emission** (`contracts/governance/src/events.rs`)
Added new event function for duration limit updates:

```rust
pub fn duration_limits_updated(env: &Env, min_duration: u64, max_duration: u64)
```

Emits a `durationupdate` event with the new min/max duration values for off-chain tracking.

## Acceptance Criteria Met

✅ **Min duration (e.g., 1 hour) and max duration (e.g., 30 days) are set at init**
- `initialize()` now accepts `min_duration` and `max_duration` parameters
- Values are stored in instance storage during contract initialization

✅ **create_proposal rejects durations outside this range**
- `create_proposal()` validates duration against stored limits
- Returns `InvalidDurationRange` error if duration is outside [min_duration, max_duration]
- Error handling unchanged from original implementation

✅ **Limits are stored in contract config storage**
- New `DataKey::MinDuration` and `DataKey::MaxDuration` variants in instance storage
- Follows existing storage tier strategy (instance storage for singleton config)
- Efficient access pattern (loaded with contract instance)

✅ **Admin can update limits after initialization**
- New `update_duration_limits()` function allows admin to adjust limits
- Admin-only access control enforced
- Respects contract pause state
- Emits event for transparency

## Backward Compatibility Notes

⚠️ **Breaking Change:** The `initialize()` function signature has changed. Existing deployment scripts and client code must be updated to pass the new `min_duration` and `max_duration` parameters.

**Migration Path:**
- For existing deployments, use the original defaults: `min_duration = 60`, `max_duration = 2_592_000`
- After initialization, use `update_duration_limits()` to adjust if needed

## Storage Impact

- **Instance Storage:** +2 new singleton keys (MinDuration, MaxDuration)
- **Persistent Storage:** No changes
- **Total overhead:** Minimal (two u64 values in instance storage)

## Testing Recommendations

1. **Initialization Tests:**
   - Verify min/max durations are stored correctly
   - Test with various duration values (0, 1, max u64, etc.)

2. **Proposal Creation Tests:**
   - Test duration validation with configurable limits
   - Verify rejection of durations outside range
   - Test boundary conditions (exactly min, exactly max, off-by-one)

3. **Update Limits Tests:**
   - Verify only admin can update limits
   - Test that new limits apply to subsequent proposals
   - Verify event emission on update
   - Test pause state blocking updates

4. **Query Tests:**
   - Verify `min_duration()` and `max_duration()` return correct values
   - Test after initialization and after updates

## Code Quality

- Follows existing code style and patterns
- Comprehensive documentation with examples
- Proper error handling and validation
- Event emission for transparency
- No breaking changes to existing proposal/voting logic
