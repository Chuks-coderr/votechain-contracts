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
 * Integration tests for webhook delivery retry logic (#227).
 *
 * All outbound HTTP calls are intercepted by vi.mock so no real network
 * traffic is generated. The tests verify:
 *
 *   1. Successful delivery on first attempt (2xx → true, no retries)
 *   2. Retry on 5xx response with exponential backoff
 *   3. Exhausted retries — returns false after MAX_RETRIES attempts
 *   4. notifyProposalStateChange fan-out tallies successes and failures
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import {
  sendWebhookWithRetry,
  notifyProposalStateChange,
  validateWebhookUrl,
  type WebhookPayload,
  type WebhookRegistration,
} from "../src/services/webhookService";

// ---------------------------------------------------------------------------
// Mock axios so no real HTTP requests are made (#227 requirement)
// ---------------------------------------------------------------------------
vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

// Shorten backoff delays during tests so the suite runs in milliseconds.
// We spy on setTimeout to assert the delay values without actually waiting.
vi.useFakeTimers();

const SAMPLE_PAYLOAD: WebhookPayload = {
  proposal_id: "proposal-abc",
  old_state: "Active",
  new_state: "Passed",
  timestamp: 1_700_000_000,
};

const WEBHOOK_URL = "https://example.com/hook";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolves a 2xx axios response. */
function ok(status = 200) {
  return Promise.resolve({ status, data: "ok" });
}

/** Rejects with an AxiosError carrying the given HTTP status. */
function httpError(status: number) {
  const err = Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status },
  });
  return Promise.reject(err);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sendWebhookWithRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true on successful first-attempt delivery (2xx)", async () => {
    mockedAxios.post = vi.fn().mockReturnValueOnce(ok(200));

    const result = await sendWebhookWithRetry(WEBHOOK_URL, SAMPLE_PAYLOAD);

    expect(result).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      WEBHOOK_URL,
      SAMPLE_PAYLOAD,
      expect.objectContaining({ timeout: 5000 })
    );
  });

  it("returns true for any 2xx status code (e.g. 201, 204)", async () => {
    mockedAxios.post = vi.fn()
      .mockReturnValueOnce(ok(201))
      .mockReturnValueOnce(ok(204));

    expect(await sendWebhookWithRetry(WEBHOOK_URL, SAMPLE_PAYLOAD)).toBe(true);
    expect(await sendWebhookWithRetry(WEBHOOK_URL, SAMPLE_PAYLOAD)).toBe(true);
  });

  it("retries on a 5xx error and succeeds on the second attempt", async () => {
    // First call: 500, second call: 200
    mockedAxios.post = vi.fn()
      .mockReturnValueOnce(httpError(500))
      .mockReturnValueOnce(ok(200));

    const resultPromise = sendWebhookWithRetry(WEBHOOK_URL, SAMPLE_PAYLOAD);

    // Advance past the first backoff (BASE_BACKOFF_MS * 2^0 = 1000 ms)
    await vi.advanceTimersByTimeAsync(1100);

    const result = await resultPromise;
    expect(result).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it("applies exponential backoff: 1s, 2s, 4s between retries", async () => {
    // Always fail with 503
    mockedAxios.post = vi.fn().mockReturnValue(httpError(503));

    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    const resultPromise = sendWebhookWithRetry(WEBHOOK_URL, SAMPLE_PAYLOAD);

    // Advance through all three retry delays: 1000, 2000, 4000 ms
    await vi.advanceTimersByTimeAsync(1100);
    await vi.advanceTimersByTimeAsync(2100);
    await vi.advanceTimersByTimeAsync(4100);

    const result = await resultPromise;
    expect(result).toBe(false);

    // Extract delay values from setTimeout calls made by the backoff logic
    const backoffDelays = setTimeoutSpy.mock.calls
      .map((args) => args[1] as number)
      .filter((d) => d >= 1000); // exclude any zero-delay internal timers

    expect(backoffDelays).toEqual(
      expect.arrayContaining([1000, 2000, 4000])
    );
  });

  it("exhausts all retries and returns false after MAX_RETRIES (3) failures", async () => {
    mockedAxios.post = vi.fn().mockReturnValue(httpError(500));

    const resultPromise = sendWebhookWithRetry(WEBHOOK_URL, SAMPLE_PAYLOAD);

    // Advance through all backoff windows
    await vi.advanceTimersByTimeAsync(1100);
    await vi.advanceTimersByTimeAsync(2100);
    await vi.advanceTimersByTimeAsync(4100);

    const result = await resultPromise;
    expect(result).toBe(false);
    // 1 initial + 3 retries = 4 total calls
    expect(mockedAxios.post).toHaveBeenCalledTimes(4);
  });

  it("treats a network error (no response) as a retryable failure", async () => {
    mockedAxios.post = vi.fn()
      .mockReturnValueOnce(Promise.reject(new Error("Network Error")))
      .mockReturnValueOnce(ok(200));

    const resultPromise = sendWebhookWithRetry(WEBHOOK_URL, SAMPLE_PAYLOAD);
    await vi.advanceTimersByTimeAsync(1100);

    const result = await resultPromise;
    expect(result).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// notifyProposalStateChange — fan-out and tally
// ---------------------------------------------------------------------------

describe("notifyProposalStateChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  const makeRegistrations = (urls: string[]): WebhookRegistration[] =>
    urls.map((webhook_url, i) => ({
      address: `GADDR${i}`,
      webhook_url,
      created_at: Date.now(),
    }));

  it("returns { successful: 1, failed: 0 } when the single delivery succeeds", async () => {
    mockedAxios.post = vi.fn().mockReturnValueOnce(ok(200));

    const result = await notifyProposalStateChange(
      makeRegistrations([WEBHOOK_URL]),
      SAMPLE_PAYLOAD
    );

    expect(result).toEqual({ successful: 1, failed: 0 });
  });

  it("returns correct tally when mixed successes and failures occur", async () => {
    mockedAxios.post = vi.fn()
      // First webhook: succeeds immediately
      .mockReturnValueOnce(ok(200))
      // Second webhook: fails all attempts
      .mockReturnValue(httpError(500));

    const resultPromise = notifyProposalStateChange(
      makeRegistrations([
        "https://ok.example.com/hook",
        "https://fail.example.com/hook",
      ]),
      SAMPLE_PAYLOAD
    );

    // Drain backoff timers for the failing webhook
    await vi.advanceTimersByTimeAsync(1100);
    await vi.advanceTimersByTimeAsync(2100);
    await vi.advanceTimersByTimeAsync(4100);

    const result = await resultPromise;
    expect(result.successful).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("returns { successful: 0, failed: 0 } with no registrations", async () => {
    const result = await notifyProposalStateChange([], SAMPLE_PAYLOAD);
    expect(result).toEqual({ successful: 0, failed: 0 });
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// validateWebhookUrl — guard tests
// ---------------------------------------------------------------------------

describe("validateWebhookUrl", () => {
  it("accepts a valid HTTPS URL", () => {
    expect(validateWebhookUrl("https://example.com/hook")).toBe(true);
  });

  it("rejects an HTTP URL (non-TLS)", () => {
    expect(validateWebhookUrl("http://example.com/hook")).toBe(false);
  });

  it("rejects a malformed URL", () => {
    expect(validateWebhookUrl("not-a-url")).toBe(false);
  });
});
