import { expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { proposalEtag } from "../src/middleware/proposalEtag";

it("returns an ETag, 304 when unchanged, and 200 once changed (#521)", async () => {
  let votes = 1;
  const app = express();
  app.get("/p", proposalEtag, (_req, res) => res.json({ votes }));

  const first = await request(app).get("/p");
  expect(first.status).toBe(200);
  const etag = first.headers.etag;
  expect(etag).toMatch(/^"[\w-]+"$/);

  const same = await request(app).get("/p").set("If-None-Match", etag);
  expect(same.status).toBe(304);
  expect(same.text).toBe("");

  votes = 2;
  const changed = await request(app).get("/p").set("If-None-Match", etag);
  expect(changed.status).toBe(200);
  expect(changed.headers.etag).not.toBe(etag);
});
