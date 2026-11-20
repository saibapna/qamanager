-- Fix approval revision 0 on the pre-existing staging schema.
-- Legacy FINAL sessions are *not* deemed valid; API revalidates before approval.
ALTER TABLE ulo_uat.ulo_sesi ALTER COLUMN revision SET DEFAULT 1;
UPDATE ulo_uat.ulo_sesi SET revision=1 WHERE revision IS NULL OR revision<1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ulo_uat.ulo_sesi'::regclass AND conname='ulo_sesi_revision_positive') THEN
    ALTER TABLE ulo_uat.ulo_sesi ADD CONSTRAINT ulo_sesi_revision_positive CHECK (revision>=1);
  END IF;
END $$;

-- Retain evidence metadata and bytes in a soft-delete tombstone to preserve provenance.
ALTER TABLE ulo_uat.ulo_evidence
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by bigint REFERENCES ulo_uat.users(id);
CREATE INDEX IF NOT EXISTS idx_evidence_active_item ON ulo_uat.ulo_evidence(item_id,created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_evidence_active_project ON ulo_uat.ulo_evidence(project_id) WHERE deleted_at IS NULL;

-- A revoked refresh token must immediately invalidate its corresponding access token.
CREATE INDEX IF NOT EXISTS idx_refresh_live_session ON ulo_uat.refresh_tokens(id,user_id) WHERE revoked=false;

-- Record the historical repair as a migration event without changing the formal approval state.
INSERT INTO ulo_uat.audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
SELECT s.project_id,NULL,'SESSION_REVISION_MIGRATED','sesi',s.id,
       jsonb_build_object('reason','prior staging revision 0 incompatible with approval constraint','legacy_final_needs_revalidation',s.status='FINAL')
FROM ulo_uat.ulo_sesi s
WHERE s.id IN (1,2)
  AND NOT EXISTS (SELECT 1 FROM ulo_uat.audit_events a WHERE a.action='SESSION_REVISION_MIGRATED' AND a.entity_type='sesi' AND a.entity_id=s.id);