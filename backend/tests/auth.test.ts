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
 * Tests for issue #517: admin JWT auth with short-lived access tokens and a
 * refresh flow.
 *
 * - Admin endpoints require a valid short-lived JWT
 * - Expired or malformed tokens return 401
 * - A refresh flow issues a new access token within the refresh window
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.stubEnv("REDIS_URL", "redis://localhost:6379");
vi.stubEnv("ADMIN_JWT_SECRET", "test-secret");
vi.stubEnv("ADMIN_STELLAR_ADDRESS", "GTEST_ADMIN_ADDRESS");

import { loadConfig } from "../src/config";
import authRoutes from "../src/routes/auth";
import { adminAuth } from "../src/middleware/adminAuth";
import { _clearRefreshStoreForTesting } from "../src/routes/auth";

loadConfig();

const ADMIN = "GTEST_ADMIN_ADDRESS";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.get("/api/admin/test", adminAuth, (_req, res) => res.json({ ok: true }));
  return app;
}

const app = buildApp();

function expiredToken(payload: object): string {
  return jwt.sign(
    { ...payload, iss: "votechain", exp: Math.floor(Date.now() / 1000) - 1 },
    "test-secret"
  );
}

describe("admin auth (issue #517)", () => {
  beforeEach(() => {
    _clearRefreshStoreForTesting();
  });

  describe("POST /api/auth/login", () => {
    it("issues a short-lived access token and refresh token for the admin", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ stellarAddress: ADMIN });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTypeOf("string");
      expect(res.body.refreshToken).toBeTypeOf("string");
      expect(res.body.expiresIn).toBe(15 * 60 * 1000);
      expect(res.body.tokenType).toBe("Bearer");
    });

    it("rejects a non-admin stellar address with 403", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ stellarAddress: "GOTHER_ADDRESS_DO_NOT_MATCH" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("returns 400 when stellarAddress is missing", async () => {
      const res = await request(app).post("/api/auth/login").send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_REQUEST");
    });
  });

  describe("adminAuth-protected endpoints", () => {
    let accessToken: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ stellarAddress: ADMIN });
      accessToken = res.body.accessToken;
    });

    it("grants access to a valid short-lived JWT", async () => {
      const res = await request(app)
        .get("/api/admin/test")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("returns 401 for an expired access token", async () => {
      const res = await request(app)
        .get("/api/admin/test")
        .set("Authorization", `Bearer ${expiredToken({ stellarAddress: ADMIN, type: "access" })}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_TOKEN");
    });

    it("returns 401 for a malformed token", async () => {
      const res = await request(app)
        .get("/api/admin/test")
        .set("Authorization", "Bearer not-a-real-token");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_TOKEN");
    });

    it("returns 401 when no Authorization header is sent", async () => {
      const res = await request(app).get("/api/admin/test");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_TOKEN");
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("issues a new access token from a valid refresh token within the window", async () => {
      const { refreshToken } = (
        await request(app).post("/api/auth/login").send({ stellarAddress: ADMIN })
      ).body;

      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTypeOf("string");
      expect(res.body.refreshToken).toBeTypeOf("string");
      expect(res.body.accessToken).not.toBe(refreshToken);

      // the new access token grants access
      const gate = await request(app)
        .get("/api/admin/test")
        .set("Authorization", `Bearer ${res.body.accessToken}`);
      expect(gate.status).toBe(200);
    });

    it("rotates the refresh token — the old one is rejected afterwards", async () => {
      const { refreshToken } = (
        await request(app).post("/api/auth/login").send({ stellarAddress: ADMIN })
      ).body;

      await request(app).post("/api/auth/refresh").send({ refreshToken });

      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_TOKEN");
    });

    it("rejects an invalid refresh token", async () => {
      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: "garbage" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_TOKEN");
    });

    it("rejects an expired refresh token", async () => {
      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: expiredToken({ stellarAddress: ADMIN, type: "refresh" }) });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_TOKEN");
    });
  });
});
