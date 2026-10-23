# Cargo Audit Exceptions Management

## Overview

This document describes how the VoteChain project manages Rust dependency vulnerabilities detected by `cargo-audit`. All exceptions must be documented, justified, and tracked.

## File Structure

- **`.cargo-audit.toml`** - Configuration file containing approved exceptions
- **`.github/workflows/audit.yml`** - CI workflow that runs cargo-audit on every PR
- **This file** - Documentation and guidelines for exception management

## Audit Execution

### Running Locally

```bash
# Install cargo-audit (if not already installed)
cargo install cargo-audit

# Update advisory database
cargo audit fetch

# Run audit
cargo audit

# Run with specific options
cargo audit --deny warnings  # Fail on any warnings/vulnerabilities
```

### CI Integration

The audit runs automatically on:
- Every push to `main` and `develop` branches
- Every pull request targeting `main` and `develop` branches
- Weekly schedule (Monday at 6 AM UTC)

The CI will **fail** if any unexcepted vulnerabilities are detected.

## Managing Exceptions

### When to Create an Exception

Exceptions should be created only in these cases:

1. **False Positives**: The vulnerability doesn't actually affect our codebase
2. **Accepted Risk**: After review, we've determined the risk is acceptable with mitigations
3. **Temporary Measure**: While waiting for a patch (must have a deadline)
4. **Third-party Code**: Vulnerabilities in vendored or submodule dependencies

### How to Add an Exception

1. **Document the Advisory ID**: Find the exact advisory ID (format: `RUSTSEC-YYYY-XXXXX`)

2. **Add to `.cargo-audit.toml`**:

```toml
[[advisories.vulnerabilities]]
id = "RUSTSEC-2024-XXXXX"
reason = "Clear explanation of why this risk is acceptable and any mitigations in place"
expires = "2024-12-31"  # Optional: set for temporary exceptions
```

3. **Create a Justification Issue**: Document in a GitHub issue with tag `vulnerability-exception`:
   - Link to the advisory
   - Explain the risk assessment
   - Describe any mitigations
   - Target remediation date (if applicable)

4. **Code Review**: Have the exception reviewed in a PR by at least one maintainer

### Exception Review Process

- **Quarterly Review**: All exceptions are reviewed every 3 months
- **After Exceptions Expire**: Automatic CI failure triggers mandatory review
- **Escalation**: Critical severity exceptions require security team sign-off

## Severity Levels

Cargo-audit categorizes vulnerabilities by severity:

- **🔴 CRITICAL**: Immediate action required
- **🟠 HIGH**: Address in next update cycle
- **🟡 MEDIUM**: Include in planned dependency updates
- **🔵 LOW**: Monitor for patterns

## Current Exceptions

| Advisory ID | Severity | Reason | Expires | Status |
|-------------|----------|--------|---------|--------|
| None | — | No active exceptions | — | Clean |

*Last reviewed: $(date)*

## Security Policy

For more information about the project's security policy, vulnerability reporting, and responsible disclosure, see [SECURITY.md](../SECURITY.md).

## Related Documentation

- [ADR-005: On-Chain Events](../docs/adr/ADR-005-on-chain-events.md) - Events and audit trails
- [SECURITY.md](../SECURITY.md) - Responsible disclosure process
- [Cargo-audit Documentation](https://github.com/rustsec/cargo-audit) - Official tool documentation

## Questions or Issues?

For security-related questions:
1. **Report vulnerabilities**: See [SECURITY.md](../SECURITY.md)
2. **Open an issue**: Use the `security` label
3. **Contact**: security@votechain.dev

## Licence Compliance Exceptions

Licence compliance is enforced in CI by `.github/workflows/licence-check.yml`:

- **Rust:** `cargo deny check licenses`, configured in `deny.toml`
- **Node.js:** `license-checker --production` in `frontend/`

**Approved licences:** MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, MPL-2.0
(plus permissive equivalents such as Unicode-3.0, Zlib and CC0-1.0).
**Denied licences:** GPL-2.0, GPL-3.0, AGPL-3.0 — CI fails if any dependency uses them.

### Adding a licence exception

1. Confirm with maintainers that the dependency's licence is acceptable for its use
   (e.g. build-time only, not distributed).
2. Add a scoped entry to `exceptions` in `deny.toml`:
   ```toml
   exceptions = [
     { allow = ["LICENSE-ID"], crate = "crate-name" },
   ]
   ```
3. Record it in the table below with a justification and review date.

| Crate / package | Licence | Justification | Added | Review by |
|-----------------|---------|---------------|-------|-----------|
| _none_          |         |               |       |           |
