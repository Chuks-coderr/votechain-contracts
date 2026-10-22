/**
 * Unit tests for the Stellar address validation middleware.
 *
 * Covers:
 *  - isValidStellarAddress() for valid and invalid inputs
 *  - validateAddressParam() middleware returns 400 on bad input and calls next() on good input
 *  - validateAddressQuery() middleware returns 400 on bad input, skips when param absent
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidStellarAddress, validateAddressParam, validateAddressQuery } from "./validation";
import { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Helpers to create minimal Express mock objects
// ---------------------------------------------------------------------------

function mockRes() {
  const res = {
    _status: 200,
    _body: undefined as unknown,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      return this;
    },
  };
  return res;
}

function mockNext(): NextFunction & { called: boolean } {
  const fn = (() => { fn.called = true; }) as NextFunction & { called: boolean };
  fn.called = false;
  return fn;
}

// ---------------------------------------------------------------------------
// isValidStellarAddress
// ---------------------------------------------------------------------------

describe("isValidStellarAddress", () => {
  // --- Valid addresses ---
  it("accepts a well-formed 56-char G-address (all letters)", () => {
    // 56 chars: G + 55 uppercase base32 chars
    assert.equal(isValidStellarAddress("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWNA"), true);
  });

  it("accepts a G-address containing digits 2-7", () => {
    // Real-world testnet account
    assert.equal(isValidStellarAddress("GBUKYX3VELQ7IQXFLIQJNPQ7DPKFR7NDLR4LQTJMUVB5LRQQ6AMXQHFA"), true);
  });

  it("accepts the minimum valid pattern: G followed by 55 base32 chars", () => {
    const addr = "G" + "A".repeat(55);
    assert.equal(isValidStellarAddress(addr), true);
  });

  // --- Invalid addresses ---
  it("rejects an address that does not start with G", () => {
    const addr = "S" + "A".repeat(55); // secret key prefix
    assert.equal(isValidStellarAddress(addr), false);
  });

  it("rejects an address that is too short (55 chars)", () => {
    const addr = "G" + "A".repeat(54);
    assert.equal(isValidStellarAddress(addr), false);
  });

  it("rejects an address that is too long (57 chars)", () => {
    const addr = "G" + "A".repeat(56);
    assert.equal(isValidStellarAddress(addr), false);
  });

  it("rejects an address containing an invalid base32 character (0)", () => {
    const addr = "G" + "0" + "A".repeat(54);
    assert.equal(isValidStellarAddress(addr), false);
  });

  it("rejects an address containing an invalid base32 character (1)", () => {
    const addr = "G" + "1" + "A".repeat(54);
    assert.equal(isValidStellarAddress(addr), false);
  });

  it("rejects an address containing an invalid base32 character (8)", () => {
    const addr = "G" + "8" + "A".repeat(54);
    assert.equal(isValidStellarAddress(addr), false);
  });

  it("rejects an address with lowercase letters", () => {
    const addr = "G" + "a".repeat(55);
    assert.equal(isValidStellarAddress(addr), false);
  });

  it("rejects an empty string", () => {
    assert.equal(isValidStellarAddress(""), false);
  });

  it("rejects a random non-address string", () => {
    assert.equal(isValidStellarAddress("not-a-stellar-address"), false);
  });
});

// ---------------------------------------------------------------------------
// validateAddressParam middleware
// ---------------------------------------------------------------------------

describe("validateAddressParam", () => {
  const middleware = validateAddressParam("address");

  it("calls next() for a valid Stellar address", () => {
    const req = { params: { address: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWNA" } } as unknown as Request;
    const res = mockRes();
    const next = mockNext();

    middleware(req, res as unknown as Response, next);

    assert.equal(next.called, true);
    assert.equal(res._status, 200);
  });

  it("returns 400 for an invalid Stellar address", () => {
    const req = { params: { address: "INVALID_ADDRESS" } } as unknown as Request;
    const res = mockRes();
    const next = mockNext();

    middleware(req, res as unknown as Response, next);

    assert.equal(next.called, false);
    assert.equal(res._status, 400);
    assert.equal((res._body as { code: string }).code, "INVALID_STELLAR_ADDRESS");
  });

  it("returns 400 when the address param is missing", () => {
    const req = { params: {} } as unknown as Request;
    const res = mockRes();
    const next = mockNext();

    middleware(req, res as unknown as Response, next);

    assert.equal(next.called, false);
    assert.equal(res._status, 400);
    assert.equal((res._body as { code: string }).code, "INVALID_STELLAR_ADDRESS");
  });

  it("returns 400 when the address starts with S (secret key)", () => {
    const req = { params: { address: "S" + "A".repeat(55) } } as unknown as Request;
    const res = mockRes();
    const next = mockNext();

    middleware(req, res as unknown as Response, next);

    assert.equal(next.called, false);
    assert.equal(res._status, 400);
  });

  it("includes a descriptive message in the 400 response", () => {
    const req = { params: { address: "bad" } } as unknown as Request;
    const res = mockRes();
    const next = mockNext();

    middleware(req, res as unknown as Response, next);

    const body = res._body as { code: string; message: string };
    assert.match(body.message, /56-character/);
  });
});

// ---------------------------------------------------------------------------
// validateAddressQuery middleware
// ---------------------------------------------------------------------------

describe("validateAddressQuery", () => {
  const middleware = validateAddressQuery("voter");

  it("calls next() when the query param is absent (optional)", () => {
    const req = { query: {} } as unknown as Request;
    const res = mockRes();
    const next = mockNext();

    middleware(req, res as unknown as Response, next);

    assert.equal(next.called, true);
  });

  it("calls next() for a valid Stellar address in query", () => {
    const req = { query: { voter: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWNA" } } as unknown as Request;
    const res = mockRes();
    const next = mockNext();

    middleware(req, res as unknown as Response, next);

    assert.equal(next.called, true);
  });

  it("returns 400 for an invalid Stellar address in query", () => {
    const req = { query: { voter: "not-valid" } } as unknown as Request;
    const res = mockRes();
    const next = mockNext();

    middleware(req, res as unknown as Response, next);

    assert.equal(next.called, false);
    assert.equal(res._status, 400);
    assert.equal((res._body as { code: string }).code, "INVALID_STELLAR_ADDRESS");
  });
});
