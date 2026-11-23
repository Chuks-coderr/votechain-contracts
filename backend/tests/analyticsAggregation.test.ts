import { describe, it, expect } from "vitest";
import {
  aggregateIntoBuckets,
  truncateToBucket,
  TimeBucket,
} from "../src/services/analyticsAggregation";

describe("truncateToBucket", () => {
  it("truncates to hour boundary", () => {
    expect(truncateToBucket("2024-03-15T14:37:22.000Z", "hourly")).toBe(
      "2024-03-15T14:00:00.000Z",
    );
  });

  it("truncates to day boundary", () => {
    expect(truncateToBucket("2024-03-15T14:37:22.000Z", "daily")).toBe(
      "2024-03-15T00:00:00.000Z",
    );
  });
});

describe("aggregateIntoBuckets", () => {
  const proposals = [
    { finalisedAt: "2024-03-15T10:00:00.000Z", uniqueVoters: ["A", "B"] },
    { finalisedAt: "2024-03-15T10:30:00.000Z", uniqueVoters: ["C"] },
    { finalisedAt: "2024-03-15T11:00:00.000Z", uniqueVoters: ["A"] },
    { finalisedAt: null, uniqueVoters: ["D"] }, // active — skipped
  ];

  it("groups proposals into hourly buckets", () => {
    const buckets = aggregateIntoBuckets(proposals, "hourly");
    expect(buckets).toHaveLength(2);
    expect(buckets[0].bucket_start).toBe("2024-03-15T10:00:00.000Z");
    expect(buckets[0].proposal_count).toBe(2);
    expect(buckets[0].participation_count).toBe(3);
    expect(buckets[1].bucket_start).toBe("2024-03-15T11:00:00.000Z");
    expect(buckets[1].proposal_count).toBe(1);
  });

  it("groups proposals into daily buckets", () => {
    const buckets = aggregateIntoBuckets(proposals, "daily");
    expect(buckets).toHaveLength(1);
    expect(buckets[0].proposal_count).toBe(3);
    expect(buckets[0].participation_count).toBe(4);
  });

  it("skips proposals with null finalisedAt", () => {
    const buckets = aggregateIntoBuckets(
      [{ finalisedAt: null, uniqueVoters: ["X"] }],
      "daily",
    );
    expect(buckets).toHaveLength(0);
  });

  it("returns buckets sorted by bucket_start ascending", () => {
    const starts = aggregateIntoBuckets(proposals, "hourly").map(
      (b: TimeBucket) => b.bucket_start,
    );
    expect(starts).toEqual([...starts].sort());
  });

  it("bucket_start aligns to configured boundary", () => {
    const hourlyBuckets = aggregateIntoBuckets(proposals, "hourly");
    for (const b of hourlyBuckets) {
      const d = new Date(b.bucket_start);
      expect(d.getUTCMinutes()).toBe(0);
      expect(d.getUTCSeconds()).toBe(0);
    }

    const dailyBuckets = aggregateIntoBuckets(proposals, "daily");
    for (const b of dailyBuckets) {
      const d = new Date(b.bucket_start);
      expect(d.getUTCHours()).toBe(0);
      expect(d.getUTCMinutes()).toBe(0);
    }
  });
});
