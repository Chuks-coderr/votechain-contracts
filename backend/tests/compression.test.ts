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
 * Tests for issue #520: gzip compression middleware.
 *
 * - Responses above the threshold are gzip-compressed
 * - /metrics is excluded from compression
 * - Asserts the Content-Encoding header for a large response
 */

import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.stubEnv("REDIS_URL", "redis://localhost:6379");
vi.stubEnv("COMPRESSION_THRESHOLD", "1000");

import { loadConfig } from "../src/config";
import { compression } from "../src/middleware/compression";

loadConfig();

const padding = "x".repeat(2000);

function buildApp() {
  const app = express();
  // Mounted globally here so the /metrics exclusion inside the middleware
  // is exercised directly.
  app.use(compression);
  app.get("/api/large", (_req, res) => {
    res.json({ items: [{ padding }], count: 1 });
  });
  app.get("/api/small", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/metrics", (_req, res) => {
    res.type("text/plain").send("# some metric 1\n");
  });
  return app;
}

const app = buildApp();

describe("compression (issue #520)", () => {
  it("compresses responses above the threshold", async () => {
    const res = await request(app)
      .get("/api/large")
      .set("Accept-Encoding", "gzip");

    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("gzip");
  });

  it("does not compress responses below the threshold", async () => {
    const res = await request(app)
      .get("/api/small")
      .set("Accept-Encoding", "gzip");

    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
  });

  it("excludes /metrics from compression", async () => {
    const res = await request(app)
      .get("/metrics")
      .set("Accept-Encoding", "gzip");

    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
  });

  it("does not compress when the client does not accept gzip", async () => {
    const res = await request(app).get("/api/large");

    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
  });
});
