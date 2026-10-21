// k6 load test for the indexer API (issue #89).
//
// Scenario 1 (spike): 1000 concurrent virtual users hammering GET /events.
// Scenario 2 (steady): constant 500 req/s for 1 minute — the SLO scenario.
//
// Threshold: p99 latency < 500ms at 500 req/s (indexer configured with
// 5 DB connections, see docs/load-test-baseline.md).
//
// Usage: k6 run -e BASE_URL=http://localhost:4000 tests/load/events.js
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

export const options = {
  scenarios: {
    concurrent_1000: {
      executor: 'per-vu-iterations',
      vus: 1000,
      iterations: 1,
      maxDuration: '30s',
      tags: { scenario: 'concurrent_1000' },
    },
    steady_500rps: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 200,
      maxVUs: 1000,
      startTime: '35s',
      tags: { scenario: 'steady_500rps' },
    },
  },
  thresholds: {
    'http_req_duration{scenario:steady_500rps}': ['p(99)<500'],
    'http_req_failed': ['rate<0.01'],
    'checks': ['rate>0.99'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/events`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'body is a JSON array': (r) => Array.isArray(r.json()),
  });
}
