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
 * Tests for issue #519: per-route request timeout middleware.
 *
 * - A configurable request timeout applies to API routes
 * - Timed-out requests return 504 with the request id
 */

import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.stubEnv("REDIS_URL", "redis://localhost:6379");
vi.stubEnv("REQUEST_TIMEOUT_MS", "50");

import { loadConfig } from "../src/config";
import { requestTracing } from "../src/middleware/requestTracing";
import { requestTimeout } from "../src/middleware/requestTimeout";

loadConfig();

function buildApp() {
  const app = express();
  app.use(requestTracing);
  app.use(requestTimeout);
  app.get("/slow", (_req, res) => {
    setTimeout(() => res.json({ ok: true }), 150);
  });
  app.get("/fast", (_req, res) => res.json({ ok: true }));
  return app;
}

const app = buildApp();

describe("request timeout (issue #519)", () => {
  it("returns 504 with the request id for a timed-out request", async () => {
    const res = await request(app)
      .get("/slow")
      .set("X-Request-Id", "req-timeout-1");

    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe("GATEWAY_TIMEOUT");
    expect(res.body.error.requestId).toBe("req-timeout-1");
    expect(res.headers["x-request-id"]).toBe("req-timeout-1");
  });

  it("still serves fast requests normally", async () => {
    const res = await request(app).get("/fast");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
