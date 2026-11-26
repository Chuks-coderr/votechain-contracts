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

import express from "express";
import cors from "cors";
import helmet from "helmet";
import http from "http";
import { connectRedis, getRedis } from "./middleware/redisCache";
import { ConfigError, getConfig, publicConfig, type Config } from "./config";
import { log, requestTracing } from "./middleware/requestTracing";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { rateLimit } from "./middleware/rateLimit";
import { jsonBodyParser } from "./middleware/jsonBodyParser";
import { metricsMiddleware, metricsHandler } from "./middleware/metrics";
import { securityHeaders } from "./middleware/securityHeaders";
import { requestTimeout } from "./middleware/requestTimeout";
import healthRoutes from "./routes/health";
import proposalRoutes from "./routes/proposals";
import csvRoutes from "./routes/csv";
import simulateRoutes from "./routes/simulate";
import analyticsRoutes from "./routes/analytics";
import { startBucketRefresh } from "./services/analyticsBucketService";
import leaderboardRoutes from "./routes/leaderboard";
import apiKeysRoutes from "./routes/apiKeys";
import adminAuditLogRoutes from "./routes/adminAuditLog";
import adminTokenRoutes from "./routes/adminToken";
import cspReportRoutes from "./routes/cspReport";
import {
  notFoundHandler,
  globalErrorHandler,
} from "./middleware/errorHandler";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function loadStartupConfig(): Config & { redisUrl: string } {
  try {
    const config = getConfig();
    if (!config.redisUrl) throw new ConfigError("REDIS_URL is required.");
    return { ...config, redisUrl: config.redisUrl };
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(
      `[startup] Invalid configuration: ${err.message} See .env.example for reference.`
    );
    process.exit(1);
  }
}

const env = loadStartupConfig();
log("info", "configuration loaded", publicConfig(env));

// ---------------------------------------------------------------------------
// CORS configuration (#32)
// ---------------------------------------------------------------------------

const allowedOrigins = env.allowedOrigins;

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (curl, server-to-server, health checks)
    if (!origin || config.ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "If-None-Match", "X-Request-Id"],
  exposedHeaders: ["ETag", "X-Record-Count", "X-Truncated", "X-Request-Id", "X-Cache", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "X-RateLimit-Tier"],
  credentials: true,
  // Tells browsers to cache the preflight response for 10 minutes
  maxAge: 600,
};

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const app = express();
app.set("trust proxy", env.trustProxy);

// Security headers — must come before routes.
// helmet()'s defaults don't match our baseline hardening requirements
// (HSTS max-age, Referrer-Policy), so they're set explicitly here.
// See docs/security/SEC-012-content-security-policy.md for the CSP policy.
app.use(
  helmet({
    hsts: {
      maxAge: 31536000, // 1 year, in seconds
      includeSubDomains: true,
    },
    frameguard: { action: "deny" }, // X-Frame-Options: DENY
    noSniff: true, // X-Content-Type-Options: nosniff
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);

// Cross-origin isolation (COOP/COEP) and Permissions-Policy — additive
// hardening on top of the baseline helmet headers above. See
// middleware/securityHeaders.ts for the widget-embed exception note.
app.use(securityHeaders);

// Handle preflight OPTIONS for all routes
app.options("*", cors(corsOptions));
app.use(cors(corsOptions));

app.use(requestTracing);
app.use(metricsMiddleware);
// CSP violation reports forwarded by Nginx (SEC-012) — mounted before auth
// since the browser-originated report never carries an API key, and before
// the global JSON parser so the route's smaller body cap applies (#516).
app.use("/", cspReportRoutes);

app.use(jsonBodyParser());

// Health, readiness and metrics — mounted BEFORE rate-limiting and auth so
// load balancers, orchestrators and Prometheus can always reach them without
// credentials.
app.get("/metrics", metricsHandler);
app.use("/", healthRoutes);

// ── API key authentication & tiered rate limiting ──────────────────────────
//
// Order matters:
//   1. apiKeyAuth   — resolves the Bearer token, sets req.apiKeyTier
//   2. rateLimit    — uses req.apiKeyTier to select the correct window
//
// Both are async middleware applied to all /api routes.  Health routes are
// intentionally excluded (mounted above, before this block).
app.use("/api", requestTimeout());
app.use("/api", apiKeyAuth);
app.use("/api", rateLimit);
app.use("/api", requestTimeout);
app.use("/api", compression);

// ── Routes ─────────────────────────────────────────────────────────────────
app.use("/api", proposalRoutes);
app.use("/api", csvRoutes);
app.use("/api", simulateRoutes);
app.use("/api", analyticsRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api", apiKeysRoutes);
app.use("/api", adminAuditLogRoutes);
app.use("/api", adminTokenRoutes);

// Catch unmatched routes — must come after all real route registrations.
app.use(notFoundHandler);

// Global error handler — must be the very last middleware registered.
app.use(globalErrorHandler);

const PORT = env.port;

// ---------------------------------------------------------------------------
// Graceful shutdown (#231)
// ---------------------------------------------------------------------------

/**
 * How long (ms) to wait for in-flight requests to drain before forcing exit.
 * Kubernetes default termination grace period is 30 s; we match it.
 */
const SHUTDOWN_TIMEOUT_MS = 30_000;

/**
 * Registers SIGTERM / SIGINT handlers that:
 *   1. Stop the HTTP server accepting new connections.
 *   2. Wait up to SHUTDOWN_TIMEOUT_MS for in-flight requests to finish.
 *   3. Close the Redis connection cleanly.
 *   4. Log the drain count and exit.
 *
 * Any error during shutdown is logged but does not prevent process exit so
 * the container is always released by the orchestrator.
 */
function registerGracefulShutdown(server: http.Server): void {
  let inflightRequests = 0;

  // Track in-flight HTTP requests so we can report the drain count.
  server.on("request", (_req, res) => {
    inflightRequests++;
    res.on("finish", () => {
      inflightRequests--;
    });
  });

  async function shutdown(signal: string): Promise<void> {
    console.log(`[shutdown] received ${signal} — stopping server`);

    // Stop accepting new connections immediately.
    server.close(async (err) => {
      if (err) {
        console.error("[shutdown] server.close error:", err);
      }
    });

    // Give in-flight requests up to SHUTDOWN_TIMEOUT_MS to complete.
    const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
    while (inflightRequests > 0 && Date.now() < deadline) {
      console.log(
        `[shutdown] waiting for ${inflightRequests} in-flight request(s)…`
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (inflightRequests > 0) {
      console.warn(
        `[shutdown] timeout reached — ${inflightRequests} request(s) still in flight; forcing exit`
      );
    } else {
      console.log("[shutdown] all in-flight requests drained");
    }

    // Close Redis cleanly so connection-pool resources are released.
    const redisClient = getRedis();
    if (redisClient?.isOpen) {
      try {
        await redisClient.quit();
        console.log("[shutdown] redis connection closed");
      } catch (redisErr) {
        console.error("[shutdown] redis quit error:", redisErr);
      }
    }

    console.log(
      `[shutdown] complete — drained ${inflightRequests === 0 ? "all" : "partial"} requests`
    );
    process.exit(inflightRequests > 0 ? 1 : 0);
  }

  process.once("SIGTERM", () => shutdown("SIGTERM").catch(console.error));
  process.once("SIGINT",  () => shutdown("SIGINT").catch(console.error));
}

// connectRedis now degrades gracefully on failure (#38) — the server always
// starts regardless of whether Redis is reachable.
connectRedis(env.redisUrl).then(() => {
  const server = http.createServer(app);
  registerGracefulShutdown(server);
  server.listen(config.PORT, () =>
    console.log(`[server] listening on :${config.PORT}`)
  );
  startBucketRefresh();
});

export default app;
