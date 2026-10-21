# SEC-006: Admin Key Rotation Procedure

| Field | Value |
|---|---|
| Record type | Security control / operational procedure |
| Date | Not recorded |
| Status | Implemented |
| Severity | Not assessed; priority is high |
| Affected components | `GovernanceContract` — `propose_admin_transfer`, `accept_admin_transfer` |
| Reporter / reviewer | Not recorded |

Format: [SEC template](SEC-TEMPLATE.md).

---

## Overview

Admin key rotation uses a **two-step, time-locked** procedure to prevent accidental or
malicious instant takeover. The current admin nominates a successor; the nominee must
explicitly accept within a configurable window before the key is transferred.

---

## Functions

### `propose_admin_transfer(admin, new_admin, window_secs)`

| Parameter | Description |
|-----------|-------------|
| `admin` | Current admin address (must authorise the call) |
| `new_admin` | Address being nominated as the next admin |
| `window_secs` | Acceptance window in seconds (0 = default 48 h) |

- Requires `admin.require_auth()`.
- Stores `new_admin` as `PendingAdmin` and records `now + window_secs` as `AdminTransferExpiry`.
- Emits `admprop` event: `(admin, new_admin, expiry)`.
- Calling again replaces any existing nomination.
- The current admin retains all privileges until `accept_admin_transfer` succeeds.

### `accept_admin_transfer(new_admin)`

| Parameter | Description |
|-----------|-------------|
| `new_admin` | The nominated address accepting the role |

- Requires `new_admin.require_auth()`.
- Reverts with `PendingAdminNotSet` (31) if no nomination exists.
- Reverts with `NotPendingAdmin` (33) if caller is not the nominated address.
- Reverts with `AdminTransferExpired` (32) if `now > expiry`; also clears the stale nomination.
- On success: promotes `new_admin` to admin, clears pending state, emits `admxfer` event.

---

## Rotation Procedure

```
1. Current admin calls propose_admin_transfer(admin, new_admin, window_secs)
   → admprop event emitted; PendingAdmin stored

2. New admin verifies the nomination on-chain (read PendingAdmin storage)

3. New admin calls accept_admin_transfer(new_admin) within the window
   → admxfer event emitted; new_admin is now admin

4. Old admin has no further privileges
```

---

## Operational Runbook (`scripts/rotate-admin.sh`)

Tooling: `scripts/rotate-admin.sh` automates both steps with safety checks.

### Pre-flight

1. Generate the new admin key on an air-gapped / hardware-backed device and import it as a
   `stellar keys` identity on the nominee's machine only.
2. Fund the new admin account (the script refuses unfunded / inactive accounts, checked via Horizon).
3. Announce the maintenance window to stakeholders and confirm no admin operations
   (execute / cancel / upgrade) are pending.

### Step 1 — Propose (current admin)

```bash
NETWORK=mainnet CONTRACT_ID=C... CURRENT_ADMIN=admin-key NEW_ADMIN=G... \
  ./scripts/rotate-admin.sh propose 172800
```

The script:
- validates `NEW_ADMIN` is a well-formed `G…` address, differs from the current admin, and is funded/active;
- prints a summary and requires the operator to **type the current admin address** to confirm;
- signs `propose_admin_transfer` with the current admin key, emitting the on-chain
  `admprop` (`admin_transfer_proposed`) audit event.

### Step 2 — Verify

- Confirm the `admprop` event on a block explorer / indexer: `(current_admin, nominee, expiry)`.
- Verify the nominee address out-of-band (second channel) before accepting.

### Step 3 — Accept (new admin)

```bash
NETWORK=mainnet CONTRACT_ID=C... NEW_ADMIN_IDENTITY=new-admin-key \
  ./scripts/rotate-admin.sh accept
```

The nominee re-confirms by typing their own address; the script signs `accept_admin_transfer`,
emitting `admxfer`.

### Step 4 — Post-rotation

1. Confirm the `admxfer` event and that an admin-only call signed by the old key now fails.
2. Revoke / archive old admin key material; update secrets in CI and `config/`.
3. Record the rotation (date, tx hashes, operators) in the ops log.

### Rollback

If the nominee key is compromised **before** acceptance, the current admin re-runs `propose`
with a different nominee (the new nomination replaces the old). If the window expires, the
stale nomination is cleared automatically on the next `accept` attempt; simply propose again.

---

## Security Properties

| Property | Guarantee |
|----------|-----------|
| Auth required | Both steps require `require_auth()` — no unsigned rotation |
| Time-lock | Nominee must act within the window; expired nominations are auto-cleared |
| No instant takeover | Admin key is not transferred until the nominee explicitly accepts |
| Re-proposal | Admin can replace a pending nomination at any time before acceptance |
| Paused contract | Both functions revert if the contract is paused |
| Zero-address guard | Both addresses are validated against the Stellar zero address |

---

## Error Codes

| Code | Variant | Meaning |
|------|---------|---------|
| 31 | `PendingAdminNotSet` | No pending nomination exists |
| 32 | `AdminTransferExpired` | Acceptance window has passed |
| 33 | `NotPendingAdmin` | Caller is not the nominated address |

---

## Events

| Symbol | Topics | Data |
|--------|--------|------|
| `admprop` | `("admprop",)` | `(current_admin, nominee, expiry: u64)` |
| `admxfer` | `("admxfer",)` | `(old_admin, new_admin)` |

---

## Recommendations

- Use a **48-hour window** (default) for production rotations to allow time for
  verification before the old key is decommissioned.
- After a successful rotation, **revoke or archive** the old admin key material.
- Monitor for `admprop` events on-chain to detect unexpected rotation attempts.
