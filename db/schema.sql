-- Isolated application schema. Only the trusted Express server connects to it.
CREATE SCHEMA IF NOT EXISTS ulo_uat;
REVOKE ALL ON SCHEMA ulo_uat FROM PUBLIC;
SET search_path TO ulo_uat, public;

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  kode VARCHAR(50) NOT NULL UNIQUE,
  nama VARCHAR(255) NOT NULL,
  instansi VARCHAR(255) NOT NULL,
  bidang VARCHAR(255),
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS templates (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  versi VARCHAR(20) NOT NULL,
  nama VARCHAR(255) NOT NULL,
  layout_hbs TEXT NOT NULL,
  partials JSONB NOT NULL DEFAULT '{}'::jsonb,
  kategori_map JSONB NOT NULL,
  page_map JSONB NOT NULL,
  checksum VARCHAR(64) NOT NULL CHECK (length(checksum) = 64),
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, versi),
  UNIQUE(id, project_id)
);

CREATE TABLE IF NOT EXISTS aplikasi (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nama_singkat VARCHAR(100) NOT NULL,
  nama_panjang VARCHAR(255),
  url VARCHAR(500),
  UNIQUE(project_id, nama_singkat),
  UNIQUE(id, project_id)
);

CREATE TABLE IF NOT EXISTS ulo_sesi (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  aplikasi_id BIGINT NOT NULL,
  template_id BIGINT NOT NULL,
  hari VARCHAR(20), tanggal DATE, pukul VARCHAR(10),
  tempat VARCHAR(255), jenis VARCHAR(255),
  penguji_nama VARCHAR(255), penguji_jabatan VARCHAR(255),
  penguji_email VARCHAR(255), penguji_telp VARCHAR(50), penguji_nip VARCHAR(50),
  saksi_nama VARCHAR(255), saksi_jabatan VARCHAR(255),
  saksi_email VARCHAR(255), saksi_telp VARCHAR(50),
  catatan TEXT, temuan TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','FINAL','SIGNED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (aplikasi_id, project_id) REFERENCES aplikasi(id, project_id),
  FOREIGN KEY (template_id, project_id) REFERENCES templates(id, project_id)
);

CREATE TABLE IF NOT EXISTS ulo_item (
  id BIGSERIAL PRIMARY KEY,
  sesi_id BIGINT NOT NULL REFERENCES ulo_sesi(id) ON DELETE CASCADE,
  no VARCHAR(20) NOT NULL,
  kategori VARCHAR(5) NOT NULL,
  kebutuhan TEXT NOT NULL,
  hasil TEXT,
  status VARCHAR(10) NOT NULL DEFAULT 'BELUM' CHECK(status IN ('PASS','FAIL','BELUM')),
  urutan INT NOT NULL CHECK(urutan > 0),
  UNIQUE(sesi_id, no),
  UNIQUE(sesi_id, urutan)
);

CREATE TABLE IF NOT EXISTS ulo_output (
  id BIGSERIAL PRIMARY KEY,
  sesi_id BIGINT NOT NULL REFERENCES ulo_sesi(id) ON DELETE CASCADE,
  versi INT NOT NULL CHECK(versi > 0),
  pdf_path VARCHAR(500) NOT NULL UNIQUE,
  sha256 VARCHAR(64) NOT NULL CHECK(length(sha256) = 64),
  size_bytes BIGINT CHECK(size_bytes >= 0),
  page_count INT CHECK(page_count > 0),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sesi_id, versi)
);

CREATE TABLE IF NOT EXISTS template_fixtures (
  id BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  nama VARCHAR(255),
  pdf_path VARCHAR(500) NOT NULL UNIQUE,
  sha256 VARCHAR(64) NOT NULL CHECK(length(sha256) = 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT REFERENCES projects(id),
  actor_id BIGINT,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_project ON templates(project_id, published);
CREATE INDEX IF NOT EXISTS idx_sesi_project ON ulo_sesi(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sesi_aplikasi ON ulo_sesi(aplikasi_id);
CREATE INDEX IF NOT EXISTS idx_item_sesi ON ulo_item(sesi_id, urutan);
CREATE INDEX IF NOT EXISTS idx_output_sesi ON ulo_output(sesi_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_project_time ON audit_events(project_id, occurred_at DESC);

-- Private schema + RLS defense-in-depth. The trusted backend connects as owner.
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE aplikasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE ulo_sesi ENABLE ROW LEVEL SECURITY;
ALTER TABLE ulo_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE ulo_output ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
