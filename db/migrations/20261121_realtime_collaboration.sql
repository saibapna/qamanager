-- Non-destructive optimistic concurrency control for multi-tester QA sessions.
-- Apply once to the existing private ulo_uat schema before deploying the new API.
BEGIN;
ALTER TABLE ulo_uat.ulo_sesi
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;
COMMIT;
