-- Migration 003: enforce event de-duplication
--
-- `insert_event` uses `ON CONFLICT DO NOTHING`, but without a unique
-- constraint that clause never fires and re-polled ledgers produce duplicate
-- rows. This migration removes any existing duplicates and adds a unique index
-- so a re-delivered event (same contract, ledger, tx hash, topic and payload)
-- is silently skipped.

DELETE FROM contract_events a
USING contract_events b
WHERE a.id > b.id
  AND a.contract_id = b.contract_id
  AND a.ledger_seq  = b.ledger_seq
  AND a.tx_hash     = b.tx_hash
  AND a.topic       = b.topic
  AND a.payload     = b.payload;

CREATE UNIQUE INDEX IF NOT EXISTS uq_events_dedupe
    ON contract_events (contract_id, ledger_seq, tx_hash, topic, md5(payload::text));
