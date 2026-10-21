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

import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";

describe("proposal HTTP lifecycle", () => {
  beforeEach(() => {
    // The current backend has no persistent proposal store. These hooks are the
    // boundary where the test database fixture from dependency #26 belongs.
  });

  afterEach(() => {
    // Tear down the seeded database fixture here once dependency #26 lands.
  });

  it("lists proposals", async () => {
    const response = await request(app).get("/api/proposals");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("gets a proposal by ID", async () => {
    const response = await request(app).get("/api/proposals/proposal-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: "proposal-1" });
  });

  it("invalidates proposal cache through HTTP", async () => {
    const response = await request(app)
      .post("/api/proposals/invalidate")
      .send({ id: "proposal-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, invalidated: "proposal-1" });
  });

  it.todo("creates a proposal after the backend proposal store is implemented");
  it.todo("casts a vote after the backend voting endpoint is implemented");
});