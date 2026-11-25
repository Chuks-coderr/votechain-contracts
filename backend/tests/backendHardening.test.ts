import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

const SECRET = "test-secret";
const ADMIN = "GADMIN";

beforeEach(() => {
  // Fresh modules so in-memory rate-limit state never leaks between tests.
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("ADMIN_JWT_SECRET", SECRET);
  vi.stubEnv("ADMIN_STELLAR_ADDRESS", ADMIN);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("config (#518)", () => {
  it("applies defaults, validates, and omits secrets from the log view", async () => {
    const { loadConfig, publicConfig } = await import("../src/config");
    expect(loadConfig({}).port).toBe(3001);
    expect(() => loadConfig({ PORT: "abc" })).toThrow("PORT");
    const names = [
      "REDIS_URL", "DATABASE_URL", "STELLAR_RPC_URL", "SOROBAN_RPC_URL",
      "ADMIN_JWT_SECRET", "SOROBAN_SECRET_KEY", "PROPOSER_SECRET_KEY",
      "FINALIZER_SECRET_KEY", "ADMIN_SECRET_KEY",
    ];
    const config = loadConfig(Object.fromEntries(names.map((n) => [n, "s3cr3t"])));
    expect(JSON.stringify(publicConfig(config))).not.toContain("s3cr3t");
  });
});

describe("CSP reports (#516)", () => {
  async function app() {
    const { default: routes } = await import("../src/routes/cspReport");
    const { globalErrorHandler } = await import("../src/middleware/errorHandler");
    return express().use(routes).use(globalErrorHandler);
  }
  const send = (a: express.Express, body: object) =>
    request(a).post("/csp-report").set("Content-Type", "application/csp-report")
      .send(JSON.stringify(body));

  it("needs no auth, and rejects oversized reports with 413", async () => {
    const a = await app();
    expect((await send(a, { "csp-report": {} })).status).toBe(204);
    expect((await send(a, { x: "x".repeat(17_000) })).status).toBe(413);
  });

  it("rejects excessive reports with 429", async () => {
    vi.stubEnv("CSP_REPORT_RATE_LIMIT", "2");
    const a = await app();
    await send(a, {});
    await send(a, {});
    expect((await send(a, {})).status).toBe(429);
  });
});

describe("admin JWT (#517)", () => {
  async function app() {
    const { adminAuth } = await import("../src/middleware/adminAuth");
    const { default: routes } = await import("../src/routes/adminToken");
    return express().use(routes).get("/x", adminAuth, (_q, r) => r.json({}));
  }
  const now = () => Math.floor(Date.now() / 1000);
  const sign = (iat: number, exp?: number, extra = {}) =>
    jwt.sign({ stellarAddress: ADMIN, iat, ...(exp && { exp }), ...extra }, SECRET);
  const get = (a: express.Express, t: string) =>
    request(a).get("/x").set("Authorization", `Bearer ${t}`);
  const refresh = (a: express.Express, t: string) =>
    request(a).post("/admin/token/refresh").set("Authorization", `Bearer ${t}`);

  it("accepts a short-lived token", async () => {
    expect((await get(await app(), sign(now(), now() + 600))).status).toBe(200);
  });

  it("rejects expired, malformed, non-expiring and long-lived tokens", async () => {
    const a = await app();
    for (const t of [
      sign(now() - 700, now() - 100), "garbage", sign(now()), sign(now(), now() + 86_400),
    ]) {
      expect((await get(a, t)).status).toBe(401);
    }
  });

  it("fails closed without a secret", async () => {
    vi.stubEnv("ADMIN_JWT_SECRET", "");
    const t = jwt.sign({ stellarAddress: ADMIN }, "changeme", { expiresIn: 60 });
    expect((await get(await app(), t)).status).toBe(401);
  });

  it("refreshes a recently expired token", async () => {
    const a = await app();
    const r = await refresh(a, sign(now() - 700, now() - 100));
    expect(r.status).toBe(200);
    expect((await get(a, r.body.token)).status).toBe(200);
  });

  it("refuses refresh outside the window or past the session limit", async () => {
    const a = await app();
    expect((await refresh(a, sign(now() - 1200, now() - 400))).status).toBe(401);
    const old = sign(now(), now() + 600, { auth_time: now() - 30_000 });
    expect((await refresh(a, old)).status).toBe(401);
  });
});

describe("request timeout (#519)", () => {
  it("returns 504 with the request id and discards the late response", async () => {
    const { requestTimeout } = await import("../src/middleware/requestTimeout");
    const { requestTracing } = await import("../src/middleware/requestTracing");
    let late: Promise<void> | undefined;
    let signal: AbortSignal | undefined;
    const a = express().use(requestTracing, requestTimeout(20));
    a.get("/slow", (_q, res) => {
      signal = res.locals.abortSignal;
      late = new Promise<void>((r) => setTimeout(r, 80)).then(() => {
        res.status(200).json({ ok: true });
      });
    });
    a.get("/override", requestTimeout(500), (_q, res) => {
      setTimeout(() => res.json({ ok: true }), 60);
    });
    const r = await request(a).get("/slow").set("X-Request-Id", "req-1");
    expect(r.status).toBe(504);
    expect(r.body.error.request_id).toBe("req-1");
    expect(signal?.aborted).toBe(true);
    await expect(late).resolves.toBeUndefined();
    expect((await request(a).get("/override")).status).toBe(200);
  });
});
