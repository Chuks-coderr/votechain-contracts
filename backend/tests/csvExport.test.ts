import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const redisState = vi.hoisted(() => ({
  client: {
    isOpen: true,
    incr: vi.fn(),
    expire: vi.fn(),
  },
}));

vi.mock("../src/middleware/redisCache", () => ({
  getRedis: () => redisState.client,
}));

import csvRoutes, { sendCsv } from "../src/routes/csv";

describe("CSV export limits", () => {
  beforeEach(() => {
    redisState.client.incr.mockReset().mockResolvedValue(1);
    redisState.client.expire.mockReset().mockResolvedValue(true);
  });

  it("caps rows at 10,000 and reports truncation headers", async () => {
    const rows = Array.from({ length: 10_001 }, (_, index) => index);
    const app = express();
    app.get("/csv", async (_req, res) => {
      await sendCsv(res, "test.csv", "row", rows, String);
    });
    const response = await request(app).get("/csv");

    expect(response.status).toBe(200);
    expect(response.headers["x-record-count"]).toBe("10000");
    expect(response.headers["x-truncated"]).toBe("true");
    expect(response.text.split("\r\n")).toHaveLength(10_002);
  });

  it("streams an unbounded source within memory limits, then closes it", async () => {
    let produced = 0;
    let closed = false;
    async function* source() {
      try {
        while (true) {
          produced++;
          yield "x".repeat(10_000);
        }
      } finally {
        closed = true;
      }
    }
    const app = express();
    let peakAhead = 0;
    let formatted = 0;
    app.get("/csv", (_req, res) =>
      sendCsv(res, "t.csv", "row", source(), (row) => {
        formatted++;
        peakAhead = Math.max(peakAhead, produced - formatted);
        return row;
      }),
    );
    const before = process.memoryUsage().heapUsed;
    let bytes = 0;
    const response = await request(app)
      .get("/csv")
      .buffer(true)
      .parse((r, cb) => {
        r.on("data", (c: Buffer) => (bytes += c.length));
        r.on("end", () => cb(null, (r as any).trailers));
      });

    expect(bytes).toBeGreaterThan(100_000_000);
    expect(response.body).toMatchObject({ "x-record-count": "10000", "x-truncated": "true" });
    expect(produced).toBe(10_001);
    expect(closed).toBe(true);
    expect(peakAhead).toBeLessThan(100);
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(80_000_000);
  });

  it("limits CSV requests to five per minute for each API key", async () => {
    redisState.client.incr.mockResolvedValueOnce(5).mockResolvedValueOnce(6);
    const app = express();
    app.use((req, _res, next) => {
      req.apiKeyMeta = {
        id: "key-1",
        owner: "owner",
        label: "test",
        createdAt: new Date(0).toISOString(),
        status: "active",
        keyPrefix: "test-key",
      };
      next();
    });
    app.use("/api", csvRoutes);

    const allowed = await request(app).get("/api/proposals.csv");
    const limited = await request(app).get("/api/proposals.csv");

    expect(allowed.status).toBe(200);
    expect(limited.status).toBe(429);
    expect(redisState.client.incr).toHaveBeenNthCalledWith(
      1,
      "rate-limit:csv-export:key:key-1",
    );
  });
});
