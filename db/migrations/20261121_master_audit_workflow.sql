-- ULO/UAT Manager master audit migration. Safe additive migration for staging.
-- Do not edit existing sessions/items/output history.
CREATE SCHEMA IF NOT EXISTS ulo_uat;

ALTER TABLE ulo_uat.users
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;
-- Bootstrap only the known existing staging administrator; future admins require a separate privileged operation.
UPDATE ulo_uat.users SET is_platform_admin=true
 WHERE lower(email)='admin@qamanager.local' AND aktif=true;

ALTER TABLE ulo_uat.projects
  ADD COLUMN IF NOT EXISTS require_dual_approval boolean NOT NULL DEFAULT true;
ALTER TABLE ulo_uat.projects
  ADD COLUMN IF NOT EXISTS require_gate_x boolean NOT NULL DEFAULT false;
UPDATE ulo_uat.projects SET require_gate_x=true WHERE kode='SIRIKAP';

ALTER TABLE ulo_uat.ulo_sesi
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1 CHECK (revision>=1);
ALTER TABLE ulo_uat.ulo_sesi
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

CREATE TABLE IF NOT EXISTS ulo_uat.test_plan_items (
  project_id bigint NOT NULL REFERENCES ulo_uat.projects(id) ON DELETE RESTRICT,
  no varchar(20) NOT NULL,
  kategori varchar(5) NOT NULL,
  kebutuhan text NOT NULL,
  urutan integer NOT NULL CHECK(urutan>0),
  gate_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id,no),
  UNIQUE(project_id,urutan)
);
-- Take a one-time canonical snapshot from the oldest populated session per project.
-- Subsequent sessions are instantiated from this catalog, NEVER from a mutable prior session.
INSERT INTO ulo_uat.test_plan_items (project_id,no,kategori,kebutuhan,urutan,gate_required)
SELECT s.project_id,i.no,i.kategori,i.kebutuhan,i.urutan,i.no IN ('X1','X2','X3','X4','X5')
FROM ulo_uat.ulo_item i
JOIN ulo_uat.ulo_sesi s ON s.id=i.sesi_id
JOIN (
  SELECT s.project_id, MIN(s.id) AS first_sesi
  FROM ulo_uat.ulo_sesi s
  WHERE EXISTS (SELECT 1 FROM ulo_uat.ulo_item i WHERE i.sesi_id=s.id)
  GROUP BY s.project_id
) base ON base.project_id=s.project_id AND base.first_sesi=s.id
ON CONFLICT(project_id,no) DO NOTHING;

CREATE TABLE IF NOT EXISTS ulo_uat.ulo_item_events (
  id bigserial PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES ulo_uat.projects(id),
  sesi_id bigint NOT NULL REFERENCES ulo_uat.ulo_sesi(id),
  item_no varchar(20) NOT NULL,
  old_status varchar(10),
  new_status varchar(10) NOT NULL,
  old_hasil text,
  new_hasil text,
  actor_id bigint REFERENCES ulo_uat.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ulo_uat.ulo_defects (
  id bigserial PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES ulo_uat.projects(id),
  sesi_id bigint NOT NULL REFERENCES ulo_uat.ulo_sesi(id),
  item_id bigint NOT NULL REFERENCES ulo_uat.ulo_item(id),
  title varchar(255) NOT NULL,
  description text,
  severity varchar(12) NOT NULL DEFAULT 'MEDIUM' CHECK(severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status varchar(16) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','FIXED','VERIFIED','WAIVED','REOPENED')),
  owner_id bigint REFERENCES ulo_uat.users(id),
  created_by bigint REFERENCES ulo_uat.users(id),
  resolution_note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(item_id)
);

CREATE TABLE IF NOT EXISTS ulo_uat.ulo_defect_comments (
  id bigserial PRIMARY KEY,
  defect_id bigint NOT NULL REFERENCES ulo_uat.ulo_defects(id) ON DELETE RESTRICT,
  actor_id bigint REFERENCES ulo_uat.users(id),
  comment text NOT NULL CHECK(length(trim(comment))>0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ulo_uat.ulo_retests (
  id bigserial PRIMARY KEY,
  defect_id bigint NOT NULL REFERENCES ulo_uat.ulo_defects(id) ON DELETE RESTRICT,
  actor_id bigint REFERENCES ulo_uat.users(id),
  status varchar(10) NOT NULL CHECK(status IN ('PASS','FAIL')),
  note text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ulo_uat.ulo_evidence (
  id bigserial PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES ulo_uat.projects(id),
  sesi_id bigint NOT NULL REFERENCES ulo_uat.ulo_sesi(id),
  item_id bigint NOT NULL REFERENCES ulo_uat.ulo_item(id),
  filename varchar(180) NOT NULL,
  mime varchar(60) NOT NULL CHECK(mime IN ('application/pdf','image/png','image/jpeg')),
  byte_size bigint NOT NULL CHECK(byte_size BETWEEN 1 AND 4194304),
  sha256 char(64) NOT NULL,
  data bytea NOT NULL,
  uploaded_by bigint REFERENCES ulo_uat.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ulo_uat.ulo_approvals (
  id bigserial PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES ulo_uat.projects(id),
  sesi_id bigint NOT NULL REFERENCES ulo_uat.ulo_sesi(id),
  revision integer NOT NULL CHECK(revision>0),
  role varchar(10) NOT NULL CHECK(role IN ('WITNESS','APPROVER')),
  decision varchar(10) NOT NULL CHECK(decision IN ('APPROVED','REJECTED')),
  actor_id bigint NOT NULL REFERENCES ulo_uat.users(id),
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sesi_id,revision,role)
);
CREATE TABLE IF NOT EXISTS ulo_uat.project_people (
  id bigserial PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES ulo_uat.projects(id) ON DELETE RESTRICT,
  kind varchar(10) NOT NULL CHECK(kind IN ('PENGUJI','SAKSI')),
  nama varchar(255) NOT NULL,
  jabatan varchar(255),
  email varchar(255),
  telepon varchar(50),
  nip varchar(50),
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ulo_uat.auth_attempts (
  key_hash char(64) PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_project_order ON ulo_uat.test_plan_items(project_id,urutan);
CREATE INDEX IF NOT EXISTS idx_members_project ON ulo_uat.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_fx_template ON ulo_uat.template_fixtures(template_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sesi_app_project ON ulo_uat.ulo_sesi(aplikasi_id,project_id);
CREATE INDEX IF NOT EXISTS idx_sesi_template_project ON ulo_uat.ulo_sesi(template_id,project_id);
CREATE INDEX IF NOT EXISTS idx_defects_sesi_status ON ulo_uat.ulo_defects(sesi_id,status);
CREATE INDEX IF NOT EXISTS idx_evidence_item ON ulo_uat.ulo_evidence(item_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approvals_sesi_revision ON ulo_uat.ulo_approvals(sesi_id,revision,role);
CREATE INDEX IF NOT EXISTS idx_events_sesi ON ulo_uat.ulo_item_events(sesi_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_people_project ON ulo_uat.project_people(project_id,kind);
CREATE INDEX IF NOT EXISTS idx_attempts_time ON ulo_uat.auth_attempts(updated_at);

-- Audit and item event rows must never be overwritten or deleted via application SQL.
CREATE OR REPLACE FUNCTION ulo_uat.forbid_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=ulo_uat,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Append-only audit record may not be modified';
END $$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='audit_events_immutable' AND tgrelid='ulo_uat.audit_events'::regclass) THEN
    CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON ulo_uat.audit_events
      FOR EACH ROW EXECUTE FUNCTION ulo_uat.forbid_audit_mutation();
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='ulo_item_events_immutable' AND tgrelid='ulo_uat.ulo_item_events'::regclass) THEN
    CREATE TRIGGER ulo_item_events_immutable BEFORE UPDATE OR DELETE ON ulo_uat.ulo_item_events
      FOR EACH ROW EXECUTE FUNCTION ulo_uat.forbid_audit_mutation();
  END IF;
END $$;

-- Backend has application-scoped SQL privileges. End-user tenant RBAC is checked in API.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'test_plan_items','ulo_item_events','ulo_defects','ulo_defect_comments',
    'ulo_retests','ulo_evidence','ulo_approvals','project_people','auth_attempts'
  ] LOOP
    EXECUTE format('ALTER TABLE ulo_uat.%I ENABLE ROW LEVEL SECURITY',t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='ulo_uat' AND tablename=t AND policyname='qamanager_backend_access'
    ) THEN
      EXECUTE format('CREATE POLICY qamanager_backend_access ON ulo_uat.%I FOR ALL TO qamanager_web USING(true) WITH CHECK(true)',t);
    END IF;
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  ulo_uat.test_plan_items,ulo_uat.ulo_defects,ulo_uat.ulo_defect_comments,
  ulo_uat.ulo_retests,ulo_uat.ulo_evidence,ulo_uat.ulo_approvals,
  ulo_uat.project_people,ulo_uat.auth_attempts TO qamanager_web;
GRANT SELECT, INSERT ON ulo_uat.ulo_item_events TO qamanager_web;
REVOKE UPDATE,DELETE ON ulo_uat.ulo_item_events FROM qamanager_web;
REVOKE UPDATE,DELETE ON ulo_uat.audit_events FROM qamanager_web;
GRANT SELECT, INSERT ON ulo_uat.audit_events TO qamanager_web;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ulo_uat TO qamanager_web;

-- Make accidental initial bootstrap not delete or update existing history.
COMMENT ON TABLE ulo_uat.test_plan_items IS 'Canonical immutable-after-publish UAT plan snapshot per project. Seeded from initial sessions once.';
COMMENT ON TABLE ulo_uat.ulo_item_events IS 'Append-only audit history of every UAT item result change.';
