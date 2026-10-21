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

-- Migration 002: add voter address index and improve event table
--
-- Adds a dedicated column and index for the voter address extracted from
-- "vote" event payloads. This enables efficient look-ups of all votes cast
-- by a specific address (required by GET /voters/:address/votes).
--
-- The voter_address column is nullable because non-vote events (created,
-- final, executed, cancelled) do not have a voter address.

ALTER TABLE contract_events
    ADD COLUMN IF NOT EXISTS voter_address TEXT;

CREATE INDEX IF NOT EXISTS idx_events_voter
    ON contract_events (voter_address)
    WHERE voter_address IS NOT NULL;

-- Composite index to speed up the common query pattern:
-- "all votes on a given proposal ordered by ledger"
CREATE INDEX IF NOT EXISTS idx_events_proposal_ledger
    ON contract_events (proposal_id, ledger_seq)
    WHERE proposal_id IS NOT NULL;
