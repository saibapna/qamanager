-- Backfill the missing foreign-key index reported by Supabase's performance advisor.
-- Index only; this migration does not mutate UAT sessions, results, or evidence.
CREATE INDEX IF NOT EXISTS idx_evidence_deleted_by ON ulo_uat.ulo_evidence(deleted_by);
