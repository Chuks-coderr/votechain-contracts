import { Pool } from "pg";

/** Precomputed hourly/daily proposal and vote counts (#524). */
export type Granularity = "hour" | "day";

export const BUCKET_MS: Record<Granularity, number> = {
  hour: 3_600_000,
  day: 86_400_000,
};

export interface AnalyticsBucket {
  bucket_start: string;
  proposals: number;
  votes: number;
}

export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

const MAX_BUCKETS = 1000;
const REFRESH_INTERVAL_MS = 60_000;
const READ_BUDGET_MS = 500;

/** Start of the UTC-aligned bucket containing `time`. */
export function bucketStart(time: Date, granularity: Granularity): Date {
  const size = BUCKET_MS[granularity];
  return new Date(Math.floor(time.getTime() / size) * size);
}

/**
 * Recomputes the newest stored bucket and everything after it (all history on
 * the first run). Whole buckets are replaced, so refreshing is idempotent.
 */
export async function refreshBuckets(db: Queryable, granularity: Granularity): Promise<void> {
  await db.query(
    `INSERT INTO analytics_buckets (granularity, bucket_start, proposals, votes)
     SELECT $1, date_bin($2::interval, ingested_at, TIMESTAMPTZ '1970-01-01 00:00:00+00') AS b,
            COUNT(*) FILTER (WHERE topic = 'created'),
            COUNT(*) FILTER (WHERE topic = 'vote')
       FROM contract_events
      WHERE topic IN ('created', 'vote')
        AND ingested_at >= COALESCE(
          (SELECT MAX(bucket_start) - $2::interval FROM analytics_buckets WHERE granularity = $1),
          '-infinity'::timestamptz)
      GROUP BY b
     ON CONFLICT (granularity, bucket_start)
     DO UPDATE SET proposals = EXCLUDED.proposals, votes = EXCLUDED.votes`,
    [granularity, `${BUCKET_MS[granularity] / 1000} seconds`],
  );
}

/** Reads `count` contiguous buckets ending now; empty buckets are zero-filled. */
export async function readBuckets(
  db: Queryable,
  granularity: Granularity,
  count: number,
  now = new Date(),
): Promise<AnalyticsBucket[]> {
  const n = Math.min(MAX_BUCKETS, Math.max(1, count));
  const size = BUCKET_MS[granularity];
  const first = bucketStart(now, granularity).getTime() - (n - 1) * size;
  const { rows } = await db.query(
    `SELECT bucket_start, proposals, votes FROM analytics_buckets
      WHERE granularity = $1 AND bucket_start >= $2`,
    [granularity, new Date(first)],
  );
  const byStart = new Map(rows.map((r) => [new Date(r.bucket_start).getTime(), r]));
  return Array.from({ length: n }, (_, i) => {
    const start = first + i * size;
    const row = byStart.get(start);
    return {
      bucket_start: new Date(start).toISOString(),
      proposals: Number(row?.proposals ?? 0),
      votes: Number(row?.votes ?? 0),
    };
  });
}

let pool: Pool | null = null;

/** Null when no database is configured. */
export function getAnalyticsDb(): Queryable | null {
  if (!process.env.DATABASE_URL) return null;
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: READ_BUDGET_MS,
    query_timeout: 30_000,
  });
  return pool;
}

/** Periodically refreshes the aggregates, outside the request path. */
export function startBucketRefresh(): void {
  const db = getAnalyticsDb();
  if (!db) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await refreshBuckets(db, "hour");
      await refreshBuckets(db, "day");
    } catch (error) {
      console.error("[Analytics] bucket refresh failed:", error);
    } finally {
      running = false;
    }
  };
  void run();
  setInterval(run, REFRESH_INTERVAL_MS).unref();
}
