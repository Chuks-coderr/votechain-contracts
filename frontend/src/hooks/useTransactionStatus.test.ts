/**
 * Unit tests for useTransactionStatus hook (issue #222).
 *
 * Covers:
 *  - pending → confirmed transition
 *  - pending → error transition with retry logic
 *  - timeout after MAX_POLLS attempts (configurable via constants in the hook)
 */

import { renderHook, act } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { useTransactionStatus } from "./useTransactionStatus";

const HASH = "abc123def456abc123def456abc123def456abc123def456abc123def456abc123";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Advance fake timers by POLL_INTERVAL_MS (3 000 ms) and flush microtasks. */
async function advancePoll(times = 1) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      vi.advanceTimersByTime(3_000);
      await Promise.resolve();
    });
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("useTransactionStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(global, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── Initial state ──────────────────────────────────────────────────────────

  it("starts in idle state with no hash", () => {
    const { result } = renderHook(() => useTransactionStatus());
    expect(result.current.tx).toEqual({
      hash: null,
      status: "idle",
      error: null,
      explorerUrl: null,
    });
  });

  // ── submit() ──────────────────────────────────────────────────────────────

  it("transitions to pending when submit() is called", () => {
    const { result } = renderHook(() => useTransactionStatus());

    act(() => {
      result.current.submit(HASH);
    });

    expect(result.current.tx.status).toBe("pending");
    expect(result.current.tx.hash).toBe(HASH);
    expect(result.current.tx.explorerUrl).toContain(HASH);
    expect(result.current.tx.error).toBeNull();
  });

  // ── pending → confirmed ───────────────────────────────────────────────────

  it("transitions to confirmed when Horizon returns 200", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);

    const { result } = renderHook(() => useTransactionStatus());

    act(() => {
      result.current.submit(HASH);
    });

    await advancePoll();

    expect(result.current.tx.status).toBe("confirmed");
    expect(result.current.tx.error).toBeNull();
  });

  // ── pending → error (unexpected status) ───────────────────────────────────

  it("transitions to failed on unexpected non-404 HTTP error", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);

    const { result } = renderHook(() => useTransactionStatus());

    act(() => {
      result.current.submit(HASH);
    });

    await advancePoll();

    expect(result.current.tx.status).toBe("failed");
    expect(result.current.tx.error).toMatch(/Unexpected response/);
  });

  // ── pending → error (network failure) ────────────────────────────────────

  it("transitions to failed on network error", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network failure"));

    const { result } = renderHook(() => useTransactionStatus());

    act(() => {
      result.current.submit(HASH);
    });

    await advancePoll();

    expect(result.current.tx.status).toBe("failed");
    expect(result.current.tx.error).toBe("Network failure");
  });

  // ── stays pending while 404 ───────────────────────────────────────────────

  it("stays pending while Horizon returns 404 (not yet confirmed)", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response);

    const { result } = renderHook(() => useTransactionStatus());

    act(() => {
      result.current.submit(HASH);
    });

    // Advance a few polls — still 404 each time
    await advancePoll(5);

    expect(result.current.tx.status).toBe("pending");
  });

  // ── timeout after MAX_POLLS (20 polls × 3 000 ms = 60 s) ─────────────────

  it("fails with timeout message after MAX_POLLS 404 responses", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response);

    const { result } = renderHook(() => useTransactionStatus());

    act(() => {
      result.current.submit(HASH);
    });

    // 20 polls exhausts MAX_POLLS
    await advancePoll(20);

    expect(result.current.tx.status).toBe("failed");
    expect(result.current.tx.error).toMatch(/60 seconds/);
  });

  // ── retry() ───────────────────────────────────────────────────────────────

  it("retry() resets poll counter and re-enters pending → confirmed", async () => {
    // First attempt: always 404 → times out
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response);

    const { result } = renderHook(() => useTransactionStatus());

    act(() => {
      result.current.submit(HASH);
    });

    await advancePoll(20);
    expect(result.current.tx.status).toBe("failed");

    // Second attempt after retry: returns 200
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);

    act(() => {
      result.current.retry(HASH);
    });

    await advancePoll();

    expect(result.current.tx.status).toBe("confirmed");
    expect(result.current.tx.hash).toBe(HASH);
  });

  // ── reset() ───────────────────────────────────────────────────────────────

  it("reset() clears state back to idle and stops polling", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response);

    const { result } = renderHook(() => useTransactionStatus());

    act(() => {
      result.current.submit(HASH);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.tx).toEqual({
      hash: null,
      status: "idle",
      error: null,
      explorerUrl: null,
    });

    // Advance timers — fetch should NOT be called after reset
    const callsBefore = vi.mocked(fetch).mock.calls.length;
    await advancePoll(5);
    expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore);
  });

  // ── branch: retry on non-existent hash is a no-op ────────────────────────

  it("retry() with empty hash does not transition to pending", () => {
    const { result } = renderHook(() => useTransactionStatus());

    act(() => {
      result.current.retry("");
    });

    expect(result.current.tx.status).toBe("idle");
  });
});
