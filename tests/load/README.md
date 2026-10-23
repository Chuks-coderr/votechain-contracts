# Load tests

k6 scripts that exercise the indexer REST API under high event volume.

```bash
# Start Postgres + indexer (DB pool limited to 5 connections), then:
make load-test                      # defaults to http://localhost:4000
make load-test LOAD_TEST_URL=http://staging:4000
```

Requires [k6](https://k6.io/docs/get-started/installation/). Thresholds
(p99 < 500ms at 500 req/s, <1% errors) make the run exit non-zero on regression.
See `docs/load-test-baseline.md` for recorded baseline results.
