# Admin Key Rotation Runbook

> **Audience:** On-call engineers and release engineers performing or authorising
> an admin key rotation.
> **Related:** [`scripts/rotate-admin.sh`](../scripts/rotate-admin.sh),
> [`docs/mainnet-runbook.md`](mainnet-runbook.md),
> [`SECURITY.md`](../SECURITY.md)

---

## Overview

VoteChain governance contracts use a two-step admin-transfer pattern (SEC-006).
The current admin _proposes_ a new admin on-chain; the nominee _accepts_ within
a configurable time window (default 48 h).  Both steps are signed by their
respective Stellar keypairs, so neither step can be forged by a third party.

The `scripts/rotate-admin.sh` script wraps both steps with input validation,
balance checks, and an interactive confirmation prompt.

---

## When to rotate

Rotate the admin key whenever:

- A team member who held the admin keypair leaves the organisation.
- The admin private key may have been exposed (leaked, compromised, or
  inadvertently committed to a repository).
- A scheduled key-rotation policy (e.g. annual) is triggered.
- Control of the admin role is being transferred to a multisig or DAO.

> **Rotate immediately** if the private key is suspected to be compromised —
> do not wait for a scheduled window.

---

## Prerequisites

Before starting, confirm all of the following:

1. **`stellar` CLI** — `stellar --version` returns without error.
2. **`curl`** — available in `$PATH`.
3. **Network config** — the correct `config/<NETWORK>.toml` file exists and
   contains valid `rpc_url` and `network_passphrase`.
4. **Current admin identity** — the Stellar identity name (not the raw key)
   registered in the CLI keystore: `stellar keys list`.
5. **Nominee account funded** — the new admin's `G...` address has a non-zero
   XLM balance on the target network.  The script verifies this via Horizon
   before submitting any transaction.
6. **`CONTRACT_ID`** — the deployed governance contract address (`C...`).

```bash
# Quick pre-flight check
stellar --version
stellar keys list
stellar keys address <CURRENT_ADMIN_IDENTITY>
curl -fsS "https://horizon.stellar.org/accounts/<NEW_ADMIN_ADDRESS>" | jq .id
```

---

## Step-by-step rotation

### Step 1 — Propose the transfer (current admin)

```bash
export NETWORK=mainnet           # or testnet / local
export CONTRACT_ID=C...          # governance contract address
export CURRENT_ADMIN=my-key-name # stellar identity name
export NEW_ADMIN=GNEW...         # nominee G... address

./scripts/rotate-admin.sh propose
# Optional: pass a custom window in seconds as second arg (default 48 h)
# ./scripts/rotate-admin.sh propose 86400   # 24 h window
```

The script will:

1. Resolve `CURRENT_ADMIN` to its on-chain address and display it.
2. Verify that `NEW_ADMIN` is a funded, active account via Horizon.
3. Print a summary and ask you to **type the current admin address** to confirm.
4. Submit the `propose_admin_transfer` transaction to the contract.
5. Print `✓ Proposed. An 'admprop' event was emitted on-chain.`

Record the transaction hash from the CLI output and open it in the network
explorer to confirm the `admprop` event is present.

### Step 2 — Accept the transfer (nominee / new admin)

This step must be completed **within the time window** set in Step 1.

```bash
export NETWORK=mainnet
export CONTRACT_ID=C...
export NEW_ADMIN_IDENTITY=my-new-key-name  # stellar identity of the nominee

./scripts/rotate-admin.sh accept
```

The script will:

1. Resolve `NEW_ADMIN_IDENTITY` to its on-chain address.
2. Verify the account is funded.
3. Print a summary and ask you to **type the new admin address** to confirm.
4. Submit the `accept_admin_transfer` transaction.
5. Print `✓ Accepted. An 'admxfer' event was emitted; <address> is now admin.`

---

## Verification

After both steps complete, verify the new admin is active on-chain:

```bash
# Query the contract's current admin
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$NEW_ADMIN_IDENTITY" \
  --rpc-url "$(grep rpc_url config/${NETWORK}.toml | sed 's/.*= *"\(.*\)"/\1/')" \
  --network-passphrase "$(grep network_passphrase config/${NETWORK}.toml | sed 's/.*= *"\(.*\)"/\1/')" \
  -- get_admin

# Expected output: the new admin's G... address
```

Also confirm via the network explorer:

1. Navigate to the contract on [Stellar Expert](https://stellar.expert) (mainnet)
   or [Testnet Expert](https://testnet.stellar.expert) (testnet).
2. Search the event log for the `admxfer` event emitted in Step 2.
3. The `new_admin` field in the event payload must match the expected address.

Run a governance action (e.g. a dry-run `create_proposal`) signed by the new
admin to confirm end-to-end:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$NEW_ADMIN_IDENTITY" \
  ...
  -- create_proposal ...
```

A successful response (or expected `DryRunSuccess`) confirms the new admin has
the required authorisation.

---

## Rollback procedure

### If Step 1 succeeded but Step 2 was never submitted (window not yet expired)

The proposed transfer is still pending on-chain. Simply **let the window
expire** — no further action is needed. The contract reverts to the current
admin automatically after expiry.

To confirm the window has expired:

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$CURRENT_ADMIN" \
  -- pending_admin_transfer
# Returns None / empty once expired
```

### If Step 2 was submitted with the wrong key (nominee identity mismatch)

The contract enforces `new_admin.require_auth()`, so an incorrect nominee
key will be **rejected on-chain** and the proposal remains pending until
the window expires. No rollback action is required.

### If the window expired and you need to retry

Re-run Step 1 with the correct nominee to start a fresh proposal:

```bash
./scripts/rotate-admin.sh propose
```

### If the rotation completed but the new admin key is immediately compromised

Perform another rotation immediately:

1. Use the **new admin** identity (which is now the active admin) to run
   Step 1 again, proposing a safe replacement key.
2. Have the replacement nominee run Step 2.
3. Revoke and destroy the compromised key material.
4. File a security incident report per [SECURITY.md](../SECURITY.md).

### Emergency: both old and new admin keys are lost

This is a critical incident.  Open a private security report via
[SECURITY.md](../SECURITY.md) immediately.  Recovery options depend on
whether the contract was deployed with an emergency admin escape hatch —
check the contract source and the relevant ADR.

---

## Post-rotation checklist

- [ ] `admxfer` event confirmed in explorer with correct new-admin address.
- [ ] Governance dry-run action signed by new admin succeeded.
- [ ] Old admin key material archived or revoked (hardware key reset,
      secret-manager version retired, etc.).
- [ ] `CURRENT_ADMIN` identity removed from shared keystores if applicable.
- [ ] Incident or change ticket closed with transaction hashes recorded.
- [ ] Relevant secrets in CI/CD environments updated to the new admin key.

---

## Security notes

- Never copy the private key to an unencrypted file or shell history.
  Use Stellar CLI identity files or a hardware wallet.
- Run the rotation from a trusted, network-isolated machine where possible.
- If running in a CI environment, use a short-lived OIDC token or a
  dedicated secrets-manager secret — never a long-lived plaintext key.
- After rotation, verify that no stale copies of the old key remain in
  `.env` files, CI secrets, or deployment configs.
