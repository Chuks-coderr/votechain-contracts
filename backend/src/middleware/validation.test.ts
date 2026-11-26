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
 * Unit tests for the zod validation schemas and validateBody middleware.
 *
 * Run with: npx ts-node -e "require('./src/middleware/validation.test.ts')"
 * Or integrate with a test runner such as Jest / Vitest.
 *
 * These are self-contained assertion tests that throw on failure so they
 * can run without a test-framework dependency.
 */

import {
  createProposalSchema,
  castVoteSchema,
  webhookConfigSchema,
  validateBody,
  validateBodyWithDepthLimit,
  measureDepth,
  DEFAULT_MAX_DEPTH,
} from "./validation";
import { z } from "zod";
import { Request, Response, NextFunction } from "express";

// ── Minimal test harness ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function describe(suite: string, fn: () => void) {
  console.log(`\n${suite}`);
  fn();
}

// ── createProposalSchema ──────────────────────────────────────────────────────

describe("createProposalSchema — valid inputs", () => {
  const valid = {
    title: "My proposal",
    description: "A detailed description of the proposal.",
    quorum: 5_000_000,
    duration: 604_800,
  };

  const result = createProposalSchema.safeParse(valid);
  assert(result.success, "accepts a fully valid proposal body");
});

describe("createProposalSchema — title validation", () => {
  const base = { description: "desc", quorum: 1, duration: 60 };

  assert(
    !createProposalSchema.safeParse({ ...base, title: "" }).success,
    "rejects empty title"
  );
  assert(
    !createProposalSchema.safeParse({ ...base, title: "a".repeat(129) }).success,
    "rejects title longer than 128 characters"
  );
  assert(
    createProposalSchema.safeParse({ ...base, title: "a".repeat(128) }).success,
    "accepts title of exactly 128 characters"
  );
  assert(
    createProposalSchema.safeParse({ ...base, title: "a" }).success,
    "accepts title of exactly 1 character"
  );
});

describe("createProposalSchema — description validation", () => {
  const base = { title: "T", quorum: 1, duration: 60 };

  assert(
    !createProposalSchema.safeParse({ ...base, description: "" }).success,
    "rejects empty description"
  );
  assert(
    !createProposalSchema.safeParse({ ...base, description: "a".repeat(1025) }).success,
    "rejects description longer than 1024 characters"
  );
  assert(
    createProposalSchema.safeParse({ ...base, description: "a".repeat(1024) }).success,
    "accepts description of exactly 1024 characters"
  );
});

describe("createProposalSchema — quorum validation", () => {
  const base = { title: "T", description: "D", duration: 60 };

  assert(
    !createProposalSchema.safeParse({ ...base, quorum: 0 }).success,
    "rejects quorum of 0"
  );
  assert(
    !createProposalSchema.safeParse({ ...base, quorum: -1 }).success,
    "rejects negative quorum"
  );
  assert(
    !createProposalSchema.safeParse({ ...base, quorum: 1.5 }).success,
    "rejects non-integer quorum"
  );
  assert(
    createProposalSchema.safeParse({ ...base, quorum: 1 }).success,
    "accepts quorum of 1"
  );
});

describe("createProposalSchema — duration validation", () => {
  const base = { title: "T", description: "D", quorum: 1 };

  assert(
    !createProposalSchema.safeParse({ ...base, duration: 59 }).success,
    "rejects duration below 60 seconds"
  );
  assert(
    !createProposalSchema.safeParse({ ...base, duration: 2_592_001 }).success,
    "rejects duration above 2592000 seconds"
  );
  assert(
    createProposalSchema.safeParse({ ...base, duration: 60 }).success,
    "accepts minimum duration of 60 seconds"
  );
  assert(
    createProposalSchema.safeParse({ ...base, duration: 2_592_000 }).success,
    "accepts maximum duration of 2592000 seconds"
  );
});

// ── castVoteSchema ────────────────────────────────────────────────────────────

const VALID_ADDRESS = "G" + "A".repeat(55); // 56 chars starting with G

describe("castVoteSchema — valid inputs", () => {
  const valid = { proposal_id: 1, vote: "Yes", voter: VALID_ADDRESS };
  assert(castVoteSchema.safeParse(valid).success, "accepts valid Yes vote");
  assert(
    castVoteSchema.safeParse({ ...valid, vote: "No" }).success,
    "accepts valid No vote"
  );
  assert(
    castVoteSchema.safeParse({ ...valid, vote: "Abstain" }).success,
    "accepts valid Abstain vote"
  );
});

describe("castVoteSchema — proposal_id validation", () => {
  const base = { vote: "Yes", voter: VALID_ADDRESS };

  assert(
    !castVoteSchema.safeParse({ ...base, proposal_id: 0 }).success,
    "rejects proposal_id of 0"
  );
  assert(
    !castVoteSchema.safeParse({ ...base, proposal_id: -1 }).success,
    "rejects negative proposal_id"
  );
  assert(
    !castVoteSchema.safeParse({ ...base, proposal_id: 1.5 }).success,
    "rejects non-integer proposal_id"
  );
});

describe("castVoteSchema — vote enum validation", () => {
  const base = { proposal_id: 1, voter: VALID_ADDRESS };

  assert(
    !castVoteSchema.safeParse({ ...base, vote: "yes" }).success,
    "rejects lowercase 'yes'"
  );
  assert(
    !castVoteSchema.safeParse({ ...base, vote: "ABSTAIN" }).success,
    "rejects uppercase 'ABSTAIN'"
  );
  assert(
    !castVoteSchema.safeParse({ ...base, vote: "Maybe" }).success,
    "rejects unknown vote value"
  );
});

describe("castVoteSchema — voter address validation", () => {
  const base = { proposal_id: 1, vote: "Yes" };

  assert(
    !castVoteSchema.safeParse({ ...base, voter: "B" + "A".repeat(55) }).success,
    "rejects address not starting with G"
  );
  assert(
    !castVoteSchema.safeParse({ ...base, voter: "G" + "A".repeat(54) }).success,
    "rejects address shorter than 56 characters"
  );
  assert(
    !castVoteSchema.safeParse({ ...base, voter: "G" + "A".repeat(56) }).success,
    "rejects address longer than 56 characters"
  );
  assert(
    castVoteSchema.safeParse({ ...base, voter: VALID_ADDRESS }).success,
    "accepts valid 56-char address starting with G"
  );
});

// ── validateBody middleware ───────────────────────────────────────────────────

describe("validateBody middleware", () => {
  function makeRes() {
    const calls: { status: number; body: unknown }[] = [];
    const res = {
      _calls: calls,
      status(code: number) {
        calls.push({ status: code, body: null });
        return this;
      },
      json(body: unknown) {
        if (calls.length) calls[calls.length - 1].body = body;
        return this;
      },
    } as unknown as Response & { _calls: typeof calls };
    return res;
  }

  // Valid body — should call next()
  {
    const middleware = validateBody(createProposalSchema);
    const req = {
      body: { title: "T", description: "D", quorum: 1, duration: 60 },
    } as Request;
    const res = makeRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    assert(nextCalled, "calls next() for valid body");
    assert((res as any)._calls.length === 0, "does not respond for valid body");
  }

  // Invalid body — should return 400
  {
    const middleware = validateBody(createProposalSchema);
    const req = { body: { title: "", quorum: -1 } } as Request;
    const res = makeRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    assert(!nextCalled, "does not call next() for invalid body");
    assert((res as any)._calls[0]?.status === 400, "responds with 400 for invalid body");
    const body = (res as any)._calls[0]?.body as any;
    assert(body?.error?.code === "VALIDATION_ERROR", "response code is VALIDATION_ERROR");
    assert(Array.isArray(body?.error?.fields), "response includes fields array");
  }
});

// ── webhookConfigSchema — nested objects & arrays ─────────────────────────────

const VALID_WEBHOOK_CONFIG = {
  address: VALID_ADDRESS,
  webhook_url: "https://example.com/hooks/votechain",
  events: ["proposal_created", "vote_cast"],
  retry: { max_attempts: 3, backoff_seconds: 5 },
  metadata: { source: "dashboard" },
};

describe("webhookConfigSchema — valid nested inputs", () => {
  const result = webhookConfigSchema.safeParse(VALID_WEBHOOK_CONFIG);
  assert(result.success, "accepts a fully valid nested webhook config");

  const minimal = webhookConfigSchema.safeParse({
    address: VALID_ADDRESS,
    webhook_url: "https://example.com/hooks/votechain",
    events: ["vote_cast"],
  });
  assert(minimal.success, "accepts a config without optional nested fields");
});

describe("webhookConfigSchema — nested object validation", () => {
  const result = webhookConfigSchema.safeParse({
    ...VALID_WEBHOOK_CONFIG,
    retry: { max_attempts: 0, backoff_seconds: -1 },
  });
  assert(!result.success, "rejects an invalid nested retry object");
  if (!result.success) {
    const paths = result.error.errors.map((issue: z.ZodIssue) => issue.path.join("."));
    assert(paths.includes("retry.max_attempts"), "reports nested field path retry.max_attempts");
    assert(
      paths.includes("retry.backoff_seconds"),
      "reports nested field path retry.backoff_seconds"
    );
  }
});

describe("webhookConfigSchema — array validation", () => {
  const badElement = webhookConfigSchema.safeParse({
    ...VALID_WEBHOOK_CONFIG,
    events: ["proposal_created", "not_an_event"],
  });
  assert(!badElement.success, "rejects an unsupported event name inside the array");
  if (!badElement.success) {
    const paths = badElement.error.errors.map((issue: z.ZodIssue) => issue.path.join("."));
    assert(paths.includes("events.1"), "reports array element path events.1");
  }

  assert(
    !webhookConfigSchema.safeParse({ ...VALID_WEBHOOK_CONFIG, events: [] }).success,
    "rejects an empty events array"
  );
  assert(
    !webhookConfigSchema.safeParse({ ...VALID_WEBHOOK_CONFIG, events: "proposal_created" }).success,
    "rejects a non-array events value"
  );
});

describe("webhookConfigSchema — type coercion for nested fields", () => {
  const coerced = webhookConfigSchema.safeParse({
    ...VALID_WEBHOOK_CONFIG,
    retry: { max_attempts: "4", backoff_seconds: "30" },
  });
  assert(coerced.success, "coerces string numbers in the nested retry object");
  if (coerced.success) {
    assert(coerced.data.retry?.max_attempts === 4, 'coerces max_attempts "4" -> 4');
    assert(coerced.data.retry?.backoff_seconds === 30, 'coerces backoff_seconds "30" -> 30');
  }
});

// ── measureDepth ──────────────────────────────────────────────────────────────

function nest(levels: number): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let node = root;
  for (let i = 1; i < levels; i++) {
    const child: Record<string, unknown> = {};
    node.child = child;
    node = child;
  }
  return root;
}

describe("measureDepth", () => {
  assert(measureDepth(1) === 0, "primitives have depth 0");
  assert(measureDepth({}) === 1, "empty object has depth 1");
  assert(measureDepth([]) === 1, "empty array has depth 1");
  assert(measureDepth({ a: { b: { c: 1 } } }) === 3, "counts nested objects");
  assert(measureDepth([[1]]) === 2, "counts nested arrays");
  assert(measureDepth(nest(5)) === 5, "counts deeply nested objects");
});

// ── validateBodyWithDepthLimit ────────────────────────────────────────────────

describe("validateBodyWithDepthLimit — nesting depth", () => {
  function makeRes() {
    const calls: { status: number; body: unknown }[] = [];
    const res = {
      _calls: calls,
      status(code: number) {
        calls.push({ status: code, body: null });
        return this;
      },
      json(body: unknown) {
        if (calls.length) calls[calls.length - 1].body = body;
        return this;
      },
    } as unknown as Response & { _calls: typeof calls };
    return res;
  }

  // Nested-but-shallow valid payload — should call next()
  {
    const middleware = validateBodyWithDepthLimit(webhookConfigSchema, 10);
    const req = { body: VALID_WEBHOOK_CONFIG } as Request;
    const res = makeRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    assert(nextCalled, "accepts a nested payload within the depth limit");
    assert((res as any)._calls.length === 0, "does not respond for a within-limit payload");
  }

  // Boundary — exactly at the limit is accepted, one level deeper is rejected
  {
    const permissive = z.object({}).passthrough();
    const atLimit = makeRes();
    let atLimitNext = false;
    validateBodyWithDepthLimit(permissive, 5)({ body: nest(5) } as Request, atLimit, () => {
      atLimitNext = true;
    });
    assert(atLimitNext, "accepts a payload exactly at the depth limit");

    const overLimit = makeRes();
    let overLimitNext = false;
    validateBodyWithDepthLimit(permissive, 5)({ body: nest(6) } as Request, overLimit, () => {
      overLimitNext = true;
    });
    assert(!overLimitNext, "rejects a payload one level beyond the depth limit");
    assert((overLimit as any)._calls[0]?.status === 400, "responds with 400 beyond the depth limit");
  }

  // Deeply nested object payload — should be rejected with 400
  {
    const middleware = validateBodyWithDepthLimit(webhookConfigSchema, 10);
    const deep: Record<string, unknown> = {};
    let node = deep;
    for (let i = 0; i < 50; i++) {
      const child: Record<string, unknown> = {};
      node.child = child;
      node = child;
    }
    const req = { body: deep } as Request;
    const res = makeRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    assert(!nextCalled, "does not call next() for a deeply nested payload");
    assert((res as any)._calls[0]?.status === 400, "responds with 400 for a deeply nested payload");
    const body = (res as any)._calls[0]?.body as any;
    assert(body?.error?.code === "VALIDATION_ERROR", "deep payload uses VALIDATION_ERROR code");
    assert(Array.isArray(body?.error?.fields), "deep payload response includes fields array");
    assert(
      /depth/i.test(body?.error?.fields[0]?.message ?? ""),
      "deep payload error explains the depth violation"
    );
  }

  // Deeply nested array payload — should also be rejected with 400
  {
    const middleware = validateBodyWithDepthLimit(webhookConfigSchema, DEFAULT_MAX_DEPTH);
    let deepArray: unknown = 1;
    for (let i = 0; i < 50; i++) deepArray = [deepArray];
    const req = { body: { events: deepArray } } as Request;
    const res = makeRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    assert(!nextCalled, "does not call next() for a deeply nested array payload");
    assert((res as any)._calls[0]?.status === 400, "responds with 400 for deeply nested arrays");
  }
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
