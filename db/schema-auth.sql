SET search_path TO ulo_uat, public;
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  nama VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_members (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK(role IN ('ADMIN','TESTER','WITNESS','APPROVER','AUDITOR')),
  PRIMARY KEY(user_id, project_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));
CREATE INDEX IF NOT EXISTS idx_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON refresh_tokens(user_id, revoked);
CREATE INDEX IF NOT EXISTS idx_tokens_expiry ON refresh_tokens(expires_at) WHERE revoked=FALSE;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

-- Supabase Data API roles must never read the private application tables directly.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA ulo_uat FROM anon';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA ulo_uat FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA ulo_uat FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA ulo_uat FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA ulo_uat FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA ulo_uat FROM authenticated';
  END IF;
END$$;
