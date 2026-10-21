-- Copyright 2024 VoteChain Contributors
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.

-- Tracks the last ledger sequence successfully processed per contract.
-- Used for backfill and resumption after restarts.
CREATE TABLE IF NOT EXISTS indexer_cursor (
    contract_id TEXT PRIMARY KEY,
    last_ledger  BIGINT NOT NULL DEFAULT 0
);

-- All VoteChain contract events, one row per event.
CREATE TABLE IF NOT EXISTS contract_events (
    id              BIGSERIAL PRIMARY KEY,
    ledger_seq      BIGINT      NOT NULL,
    tx_hash         TEXT        NOT NULL,
    contract_id     TEXT        NOT NULL,
    topic           TEXT        NOT NULL,  -- e.g. "created", "vote", "final"
    proposal_id     BIGINT,                -- NULL for non-proposal events
    payload         JSONB       NOT NULL,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_contract   ON contract_events (contract_id);
CREATE INDEX IF NOT EXISTS idx_events_topic      ON contract_events (topic);
CREATE INDEX IF NOT EXISTS idx_events_proposal   ON contract_events (proposal_id);
CREATE INDEX IF NOT EXISTS idx_events_ledger     ON contract_events (ledger_seq);
