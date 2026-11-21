-- Reusable BA/ULO/UAT templates: explicit opt-in, tenant-safe catalog.
-- Existing templates, UAT sessions, fixtures, PDF outputs and approvals are untouched.
-- Only server-side PostgreSQL (ulo_uat) has access. Never expose through the Data API.
CREATE TABLE IF NOT EXISTS ulo_uat.template_shares (
  template_id bigint PRIMARY KEY,
  project_id bigint NOT NULL,
  shared_by bigint REFERENCES ulo_uat.users(id) ON DELETE SET NULL,
  shared_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT template_shares_source_fk
    FOREIGN KEY (template_id, project_id)
    REFERENCES ulo_uat.templates(id, project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS template_shares_project_id_idx
  ON ulo_uat.template_shares(project_id, shared_at DESC);

ALTER TABLE ulo_uat.template_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ulo_uat.template_shares FROM PUBLIC;
REVOKE ALL ON TABLE ulo_uat.template_shares FROM anon, authenticated;

-- Defense in depth: only published templates from active projects can be offered.
CREATE OR REPLACE FUNCTION ulo_uat.enforce_template_share_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, ulo_uat
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ulo_uat.templates t
    JOIN ulo_uat.projects p ON p.id = t.project_id
    WHERE t.id = NEW.template_id
      AND t.project_id = NEW.project_id
      AND t.published = TRUE
      AND p.aktif = TRUE
  ) THEN
    RAISE EXCEPTION 'Only published templates from active projects may be shared'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION ulo_uat.enforce_template_share_published() FROM PUBLIC;

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'ulo_uat.template_shares'::regclass
      AND tgname = 'trg_enforce_template_share_published'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_enforce_template_share_published
    BEFORE INSERT OR UPDATE ON ulo_uat.template_shares
    FOR EACH ROW EXECUTE FUNCTION ulo_uat.enforce_template_share_published();
  END IF;
END;
$;

COMMENT ON TABLE ulo_uat.template_shares IS
  'Only an explicit source-project ADMIN may share a published template. No fixture, session, evidence or PDF content is shared. Imported templates are independent DRAFT copies.';
