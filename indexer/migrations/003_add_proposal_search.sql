-- Migration 003: Add full-text search vector to proposals table.
--
-- Issue #40: Proposal search endpoint with full-text search.
--
-- Adds a generated tsvector column that combines the title (weight A = highest)
-- and description (weight B) fields.  A GIN index is created on this column so
-- that `websearch_to_tsquery` queries are served from the index rather than a
-- sequential scan.
--
-- Weight values:
--   'A' (title)       — highest rank, matches in title score more than description
--   'B' (description) — lower rank than title
--
-- The 'english' dictionary applies stemming and stop-word removal so that
-- queries like "treasury" also match "treasuries".
--
-- Search is case-insensitive because tsvector normalises tokens to lower-case.
--
-- Parameterised queries (websearch_to_tsquery) prevent SQL injection — no raw
-- query string is ever interpolated into SQL.

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED;

-- GIN index for efficient full-text lookups.
CREATE INDEX IF NOT EXISTS proposals_search_idx
  ON proposals USING GIN (search_vector);

-- Comment for documentation purposes.
COMMENT ON COLUMN proposals.search_vector IS
  'Auto-generated tsvector combining title (A) and description (B) for full-text search.';
