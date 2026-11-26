import { expect, it, vi } from "vitest";
import { bucketStart, readBuckets, refreshBuckets } from "../src/services/analyticsBucketService";

const now = new Date("2024-03-10T13:45:30Z");

it("aligns buckets to UTC hour and day boundaries (#524)", () => {
  expect(bucketStart(now, "hour").toISOString()).toBe("2024-03-10T13:00:00.000Z");
  expect(bucketStart(now, "day").toISOString()).toBe("2024-03-10T00:00:00.000Z");
  const edge = new Date("2024-03-10T13:00:00Z");
  expect(bucketStart(edge, "hour")).toEqual(edge);
});

it("reads contiguous zero-filled buckets from the precomputed table within budget", async () => {
  const query = vi.fn().mockResolvedValue({
    rows: [{ bucket_start: new Date("2024-03-10T12:00:00Z"), proposals: "2", votes: "7" }],
  });
  const started = performance.now();
  const buckets = await readBuckets({ query }, "hour", 3, now);
  expect(performance.now() - started).toBeLessThan(500);
  expect(buckets).toEqual([
    { bucket_start: "2024-03-10T11:00:00.000Z", proposals: 0, votes: 0 },
    { bucket_start: "2024-03-10T12:00:00.000Z", proposals: 2, votes: 7 },
    { bucket_start: "2024-03-10T13:00:00.000Z", proposals: 0, votes: 0 },
  ]);
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][0]).not.toContain("contract_events");
});

it("refreshes with the configured bucket width", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  await refreshBuckets({ query }, "day");
  expect(query.mock.calls[0][1]).toEqual(["day", "86400 seconds"]);
});
