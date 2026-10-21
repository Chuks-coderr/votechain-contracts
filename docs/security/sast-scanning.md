# SAST Scanning

VoteChain runs static application security testing (SAST) across both languages in the
repository, using the tool best suited to each:

## TypeScript / JavaScript — CodeQL

`.github/workflows/codeql.yml` runs GitHub CodeQL's `javascript-typescript` analysis with the
`security-extended` query pack against `backend/` and `frontend/`.

- **Triggers:** every push to `main`, every pull request targeting `main`, and a weekly scheduled
  run (`0 8 * * 1`, Mondays 08:00 UTC) to catch newly published CodeQL queries against unchanged
  code.
- **Results:** SARIF output is uploaded automatically by `github/codeql-action/analyze` and appears
  under the repository's **Security → Code scanning alerts** tab.
- **PR gate:** the `enforce-severity-gate` job queries the code scanning alerts API for the PR's
  ref after analysis completes and fails the workflow if any **open alert with `critical` or
  `high` security severity** exists. This is a required status check, so such PRs cannot merge
  until the finding is fixed or dismissed.

## Rust — cargo-audit + Clippy (CodeQL alternative)

CodeQL's Rust support does not have a stable, general-purpose query pack (unlike its
JavaScript/TypeScript, Python, Go, Java, C/C++, C#, and Ruby support), so running it against
`contracts/`, `indexer/`, and `api/` would give a false sense of coverage. Instead, Rust SAST is
covered by two tools already wired into CI:

| Concern | Tool | Where |
|---------|------|-------|
| Known-vulnerable dependencies (CVE/RUSTSEC advisories) | `cargo audit --deny warnings` | `.github/workflows/audit.yml` (dedicated job) and `ci.yml`'s `security-audit` job, both on every push/PR, plus scheduled runs |
| Common bug patterns, unsafe idioms, correctness lints | `cargo clippy --all-targets -- -D warnings` | `.github/workflows/ci.yml`'s `lint` job, on every push/PR |

Both are required status checks — a warning from either tool fails the workflow, which has the
same blocking effect on PRs that CodeQL's severity gate has for the TypeScript side.

If CodeQL later ships first-class Rust support, this document should be revisited and the
`analyze` job's `languages` matrix expanded to include `rust` again.

## Scan Frequency Summary

| Language | Trigger | Blocks PR on critical/high? |
|----------|---------|------------------------------|
| TypeScript/JavaScript | push to `main`, PR to `main`, weekly (Mon 08:00 UTC) | Yes — `enforce-severity-gate` |
| Rust | push to `main`, PR to `main` (via `ci.yml`/`audit.yml`) | Yes — any `clippy`/`cargo audit` failure blocks the required checks |
