# Mutation Testing

A high test count doesn't prove the tests catch bugs. [`cargo-mutants`](https://mutants.rs)
deliberately breaks the contract code, for example by swapping `<` for `<=`,
replacing a function body with `Ok(())` or deleting a `!`, and then checks
that at least one test fails for each change.

## Running

```bash
make mutants
```

This installs `cargo-mutants` if needed. It then mutates
`contracts/governance/src/lib.rs` and `contracts/token/src/lib.rs` and runs
each crate's test suite against every mutant. Results are written to
`mutants.out/`:

| File           | Meaning                                              |
|----------------|------------------------------------------------------|
| `caught.txt`   | Mutants detected by a failing test ✅                 |
| `missed.txt`   | Mutants no test detected ❌ (these need new tests)    |
| `timeout.txt`  | Mutants that hung (these count as caught)            |
| `unviable.txt` | Mutants that failed to compile (excluded from score) |

Configuration lives in `.cargo/mutants.toml`.

## Score

```
mutation score = caught / (caught + missed)       (unviable excluded)
```

**Target: > 80% for both contracts.**

## Baseline

| Contract   | Caught | Missed | Timeout | Unviable | Score |
|------------|--------|--------|---------|----------|-------|
| governance | TBD    | TBD    | TBD     | TBD      | TBD   |
| token      | TBD    | TBD    | TBD     | TBD      | TBD   |

Update this table whenever `make mutants` is re-run on `main`.

## Triage of undetected mutants

For every entry in `missed.txt`:

1. **High risk** means the mutant touches authorization, balance or tally
   arithmetic, state transitions, or an initialization or re-entrancy guard.
   Add a test that fails on the mutant. The SEC-specific regression tests in
   `contracts/governance/src/security_regression_tests.rs` and the
   cross-contract tests in `contracts/governance/src/integration_test.rs` were
   added for this purpose.
2. **Low risk** means the mutant is in event payload formatting, getters, or
   equivalent code. Record it here with a brief justification.
