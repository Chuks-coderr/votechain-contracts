-- Precomputed, UTC-aligned analytics aggregates (issue #524).
-- Refreshed by backend/src/services/analyticsBucketService.ts.
CREATE TABLE IF NOT EXISTS analytics_buckets (
    granularity   TEXT        NOT NULL CHECK (granularity IN ('hour', 'day')),
    bucket_start  TIMESTAMPTZ NOT NULL,
    proposals     BIGINT      NOT NULL DEFAULT 0,
    votes         BIGINT      NOT NULL DEFAULT 0,
    PRIMARY KEY (granularity, bucket_start)
);

CREATE INDEX IF NOT EXISTS idx_events_ingested_at ON contract_events (ingested_at);
