-- Apply once after db/supabase-bootstrap.sql on a dedicated Supabase project.
-- Creates an application-only PostgreSQL role WITHOUT a login password.
-- Provision its password separately through secret management, then enable LOGIN.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qamanager_web') THEN
    CREATE ROLE qamanager_web NOLOGIN NOINHERIT;
  END IF;
END $$;

REVOKE ALL ON SCHEMA ulo_uat FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA ulo_uat TO qamanager_web;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ulo_uat TO qamanager_web;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ulo_uat TO qamanager_web;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ulo_uat
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO qamanager_web;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ulo_uat
  GRANT USAGE, SELECT ON SEQUENCES TO qamanager_web;
ALTER ROLE qamanager_web IN DATABASE postgres SET search_path TO ulo_uat, public;

-- RLS permits server-side access for the specifically provisioned DB identity.
-- Tenant-level authorization remains enforced in the Hono backend using
-- project_members before every resource access. Never give this role to a browser.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'ulo_uat' LOOP
    EXECUTE format('CREATE POLICY qamanager_backend_access ON ulo_uat.%I\n      FOR ALL TO qamanager_web USING (true) WITH CHECK (true)', t.tablename);
  END LOOP;
END $$;
