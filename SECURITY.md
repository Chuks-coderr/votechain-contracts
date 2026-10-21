# Security Policy

## Supported Versions

| Version | Supported |
|--------:|:---------:|
| `main`  | ✅ |

Fixes are applied to `main` first. If you are running a fork or a pinned commit, please still report — we will coordinate disclosure with you.

---

## Responsible Disclosure

Please **do not** open a public GitHub Issue for security vulnerabilities. Public disclosure before a fix is available puts all users at risk.

Follow this process instead:

1. **Report privately** using one of the contact methods below.
2. We **acknowledge your report within 48 hours**.
3. We **triage and assign a severity within 7 days** and share our assessment with you.
4. We **ship a patch within 30 days for critical issues** (see the SLA table for other severities).
5. We agree a coordinated disclosure date with you, typically after the fix is released.
6. You are credited in the [Hall of Fame](#hall-of-fame--acknowledgements) and release notes unless you prefer to remain anonymous.

---

## Contact

| Method | Details | Expected first response |
|--------|---------|-------------------------|
| Email | **security@votechain.dev** (monitored by maintainers) | ≤ 48 hours |
| GitHub Private Advisory | [GitHub Security Advisories](https://github.com/veracindarella/votechain-contracts/security/advisories/new) — confidential, no email required | ≤ 48 hours |

If you receive no acknowledgement within 48 hours, please follow up via the other channel.

When reporting, please include:

- A clear description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept (PoC)
- Affected component(s) — contract name, function, file path, commit hash
- Any suggested mitigation or patch (optional but appreciated)

### Encrypting sensitive reports

For sensitive details (working exploits, private data), encrypt your report:

- **Preferred:** use a GitHub Private Advisory — its content is visible only to maintainers and you.
- **PGP email:** request the current PGP public key by emailing security@votechain.dev with the subject `PGP key request` (no vulnerability details). Confirm the fingerprint with a maintainer through a second channel (for example a GitHub Private Advisory) before use, then encrypt:

  ```bash
  gpg --import votechain-security.asc
  gpg --encrypt --armor --recipient security@votechain.dev report.md
  ```

  Attach `report.md.asc` to your email. Never send private keys or seed phrases, even encrypted.

---

## Response SLA

| Milestone | Target |
|-----------|--------|
| Acknowledgement | **≤ 48 hours** |
| Triage & severity assignment | **≤ 7 days** |
| Patch — Critical (loss of funds, vote forgery, governance takeover) | **≤ 30 days** |
| Patch — High | ≤ 60 days |
| Patch — Medium / Low | Next scheduled release |
| Status updates during remediation | At least every 7 days |
| Coordinated public disclosure | Agreed with reporter, typically after the fix is released (max 90 days from report) |

---

## Incident Response

When a vulnerability is confirmed or an exploit is observed on a live deployment:

1. **Contain** — the admin calls `pause` on affected contracts to halt proposal creation and voting.
2. **Assess** — identify affected deployments, proposals and funds; preserve on-chain evidence (transaction hashes, events).
3. **Remediate** — develop and review the fix privately (GitHub Security Advisory fork); add regression tests.
4. **Recover** — deploy the fix via the [upgrade procedure](docs/upgrading.md), then `unpause`.
5. **Communicate** — publish a GitHub Security Advisory and CHANGELOG entry; notify integrators.
6. **Review** — publish a post-mortem within 14 days of resolution.

---

## Scope

### In scope

- `contracts/governance/**` — proposal creation, voting, finalisation, execution, cancellation
- `contracts/token/**` — governance token minting, balances, transfers
- Contract logic errors: state transitions, quorum/tally calculation, access control, delegation
- Build and CI tooling that could affect contract correctness (`scripts/`, `.github/workflows/`)
- `frontend/`, `backend/` and `indexer/` code in this repository

### Out of scope

- Third-party dependencies and upstream toolchains (Rust, Soroban SDK, Stellar Core) — please report those to the respective upstream projects
- Social engineering, phishing, or physical attacks
- Denial-of-service attacks that rely on unrealistic network-level assumptions outside the Soroban execution model
- Issues in forks or unofficial deployments not maintained by this repository

---

## Bug Bounty

This project **does not currently operate a paid bug bounty program**.

We recognise and publicly credit all valid security reports in release notes. If a bounty program is introduced in the future, this document will be updated with program rules, payout ranges, and a link to the bounty platform.

---

## Hall of Fame / Acknowledgements

We thank the following people for responsibly disclosing security issues:

| Reporter | Issue | Date |
|----------|-------|------|
| _Your name here_ | — | — |

Reporters are added here (with their permission) once the fix is released.

---

## Security Design Notes

Key security properties of the contracts:

- `cast_vote` calls `require_auth()` — votes cannot be forged by a third party
- Double-vote prevention via a persistent `HasVoted(proposal_id, voter)` storage key
- Vote weight equals the voter's token balance at the time of the vote — no snapshot manipulation
- Only the designated admin address can execute or cancel proposals
- Quorum is enforced at finalisation — proposals cannot pass silently with low turnout
- All token amounts use `i128` — no floating-point arithmetic or rounding errors

---

## SEC-014 — Event Schema Audit (OWASP Information Leakage Review)

**Date:** 2026-04-29  
**Reviewer:** automated + manual  
**Finding:** ✅ No sensitive information leakage detected

### Event schema

| Event topic  | Topic args    | Data payload                              | Assessment |
|-------------|---------------|-------------------------------------------|------------|
| `"init"`    | —             | `admin: Address`                          | ✅ Minimal — admin is a public role |
| `"created"` | `id: u64`     | `proposer: Address`                       | ✅ Minimal — proposal creation is a public act |
| `"vote"`    | `id: u64`     | `(voter: Address, vote: Vote, weight: i128)` | ✅ Necessary for governance auditability; token balances used as vote weights are intentionally public |
| `"final"`   | `id: u64`     | `(state: ProposalState, execute_after: u64)` | ✅ Minimal — outcome and earliest execution timestamp |
| `"executed"` | `id: u64`    | `()`                                      | ✅ Empty — no data exposed |
| `"cancelled"` | `id: u64`   | `()`                                      | ✅ Empty — no data exposed |
| `"qupdate"` | `id: u64`     | `new_quorum: i128`                        | ✅ Quorum is a public governance parameter |
| `"admxfer"` | —             | `(old_admin: Address, new_admin: Address)` | ✅ Admin addresses are public roles |
| `"paused"`  | —             | `admin: Address`                          | ✅ Pause actor is a public accountability record |
| `"unpaused"` | —            | `admin: Address`                          | ✅ Same as above |

### OWASP alignment

- **A3 – Sensitive Data Exposure**: No private keys, seeds, internal counters, or raw storage indices are emitted. All emitted values are either public governance state or addresses that are inherently visible on-chain.
- **A6 – Security Misconfiguration**: Topic symbols use short 7-character identifiers — no disambiguation ambiguity between event types.
- **Data minimisation**: Each event carries only data required for off-chain indexers to reconstruct governance state. No redundant fields are present.

### Conclusion

All emitted events satisfy the principle of minimal disclosure. No remediation required.
