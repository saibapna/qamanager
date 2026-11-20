-- Master
CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  kode VARCHAR(50) UNIQUE NOT NULL,
  nama VARCHAR(255) NOT NULL,
  instansi VARCHAR(255) NOT NULL,
  bidang VARCHAR(255),
  aktif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE templates (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  versi VARCHAR(20) NOT NULL,
  nama VARCHAR(255) NOT NULL,
  layout_hbs TEXT NOT NULL,
  partials JSONB DEFAULT '{}',
  kategori_map JSONB NOT NULL,
  page_map JSONB NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, versi)
);

CREATE TABLE aplikasi (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nama_singkat VARCHAR(100) NOT NULL,
  nama_panjang VARCHAR(255),
  url VARCHAR(500),
  UNIQUE(project_id, nama_singkat)
);

CREATE TABLE ulo_sesi (
  id BIGSERIAL PRIMARY KEY,
  aplikasi_id BIGINT NOT NULL REFERENCES aplikasi(id) ON DELETE CASCADE,
  template_id BIGINT NOT NULL REFERENCES templates(id),
  hari VARCHAR(20), tanggal DATE, pukul VARCHAR(10),
  tempat VARCHAR(255), jenis VARCHAR(255),
  penguji_nama VARCHAR(255), penguji_jabatan VARCHAR(255),
  penguji_email VARCHAR(255), penguji_telp VARCHAR(50), penguji_nip VARCHAR(50),
  saksi_nama VARCHAR(255), saksi_jabatan VARCHAR(255),
  saksi_email VARCHAR(255), saksi_telp VARCHAR(50),
  catatan TEXT, temuan TEXT,
  status VARCHAR(20) DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ulo_item (
  id BIGSERIAL PRIMARY KEY,
  sesi_id BIGINT NOT NULL REFERENCES ulo_sesi(id) ON DELETE CASCADE,
  no VARCHAR(20) NOT NULL,
  kategori VARCHAR(5) NOT NULL,
  kebutuhan TEXT NOT NULL,
  hasil TEXT,
  status VARCHAR(10) DEFAULT 'BELUM',
  urutan INT NOT NULL,
  UNIQUE(sesi_id, no)
);

CREATE TABLE ulo_output (
  id BIGSERIAL PRIMARY KEY,
  sesi_id BIGINT NOT NULL REFERENCES ulo_sesi(id) ON DELETE CASCADE,
  versi INT DEFAULT 1,
  pdf_path VARCHAR(500) NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  size_bytes BIGINT,
  page_count INT,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sesi_id, versi)
);

CREATE TABLE template_fixtures (
  id BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  nama VARCHAR(255),
  pdf_path VARCHAR(500) NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_templates_project ON templates(project_id, published);
CREATE INDEX idx_sesi_aplikasi ON ulo_sesi(aplikasi_id);
CREATE INDEX idx_item_sesi ON ulo_item(sesi_id, urutan);
