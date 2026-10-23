// Copyright 2024 VoteChain Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Prometheus metrics for the VoteChain backend. (#66)
 *
 * Exposes GET /metrics in Prometheus text-exposition format with:
 *   - votechain_http_requests_total          — counter, labels: method, route, status
 *   - votechain_http_request_duration_seconds — histogram (p50/p95/p99 via
 *     histogram_quantile in Prometheus/Grafana), labels: method, route, status
 *   - votechain_cache_hit_rate                — gauge, ratio of Redis cache hits (0-1)
 *   - votechain_active_db_connections         — gauge, active Redis connections
 *     (the backend's only persistent-connection dependency today; named for the
 *     acceptance criterion and documented in docs/observability.md)
 *
 * Route labels use the matched Express route pattern (e.g. "/api/proposals/:id")
 * rather than the raw URL, so metrics don't explode in cardinality per proposal id.
 */

import { Request, Response, NextFunction } from "express";
import client from "prom-client";
import { getCacheMetrics, isRedisReady } from "./redisCache";

export const registry = new client.Registry();

client.collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new client.Counter({
  name: "votechain_http_requests_total",
  help: "Total number of HTTP requests, labelled by method, route and status code",
  labelNames: ["method", "route", "status"] as const,
  registers: [registry],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: "votechain_http_request_duration_seconds",
  help: "HTTP request latency in seconds, labelled by method, route and status code",
  labelNames: ["method", "route", "status"] as const,
  // Buckets tuned around the p99 < 2s alerting threshold (#66).
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

export const cacheHitRateGauge = new client.Gauge({
  name: "votechain_cache_hit_rate",
  help: "Redis cache hit rate as a ratio between 0 and 1, sampled on scrape",
  registers: [registry],
  collect() {
    const { hitRate } = getCacheMetrics();
    this.set(hitRate);
  },
});

export const activeDbConnectionsGauge = new client.Gauge({
  name: "votechain_active_db_connections",
  help: "Active connections to the backend's persistent data store (Redis)",
  registers: [registry],
  collect() {
    this.set(isRedisReady() ? 1 : 0);
  },
});

/**
 * Resolves a low-cardinality route label for a request.
 * Falls back to "unmatched" when Express hasn't matched a route (404s).
 */
function routeLabel(req: Request): string {
  const route = req.route?.path as string | undefined;
  if (route) {
    const mountPath = req.baseUrl ?? "";
    return `${mountPath}${route}` || req.path;
  }
  return "unmatched";
}

/**
 * Middleware that records request count and latency for every request.
 * Mount this before routes so it wraps the full request lifecycle, and
 * read `req.route` on `res.on("finish")` — by then Express has matched
 * the route (if any).
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = {
      method: req.method,
      route: routeLabel(req),
      status: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  });

  next();
}

/**
 * GET /metrics handler — Prometheus text-exposition format.
 */
export async function metricsHandler(_req: Request, res: Response) {
  res.setHeader("Content-Type", registry.contentType);
  res.end(await registry.metrics());
}
