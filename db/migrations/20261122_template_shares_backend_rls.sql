-- Fix backend-only RLS on shared template catalog.
-- Non-destructive: no template, share, fixture, session, or PDF rows are changed.
-- Application membership checks remain enforced by Hono route guards.
BEGIN;
ALTER TABLE ulo_uat.template_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ulo_uat.template_shares FROM PUBLIC, anon, authenticated;
REVOKE UPDATE ON TABLE ulo_uat.template_shares FROM qamanager_web;
GRANT SELECT, INSERT, DELETE ON TABLE ulo_uat.template_shares TO qamanager_web;
DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'ulo_uat' AND tablename = 'template_shares'
      AND policyname = 'qamanager_template_shares_select'
  ) THEN
    CREATE POLICY qamanager_template_shares_select
      ON ulo_uat.template_shares FOR SELECT TO qamanager_web USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'ulo_uat' AND tablename = 'template_shares'
      AND policyname = 'qamanager_template_shares_insert'
  ) THEN
    CREATE POLICY qamanager_template_shares_insert
      ON ulo_uat.template_shares FOR INSERT TO qamanager_web WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'ulo_uat' AND tablename = 'template_shares'
      AND policyname = 'qamanager_template_shares_delete'
  ) THEN
    CREATE POLICY qamanager_template_shares_delete
      ON ulo_uat.template_shares FOR DELETE TO qamanager_web USING (true);
  END IF;
END;
$policy$;
COMMIT;
