-- ULO/UAT Manager bootstrap for an EMPTY private ulo_uat schema.
-- Intentionally omits db/seed-users.sql (insecure public demo accounts).


-- SOURCE: db/schema.sql
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


-- SOURCE: db/schema-auth.sql
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


-- SOURCE: db/seed-projects.sql
SET search_path TO ulo_uat, public;
INSERT INTO projects (kode, nama, instansi, bidang) VALUES
  ('SIRIKAP','SIRIKAP - Sistem Inovasi dan Riset Kabupaten Pidie',
   'Badan Perencanaan Pembangunan Daerah Kabupaten Pidie','Bidang Layanan E-Government'),
  ('SIMPEG','SIMPEG - Sistem Informasi Kepegawaian',
   'Badan Kepegawaian Daerah Provinsi Aceh','Bidang Pengembangan Aplikasi') ON CONFLICT (kode) DO NOTHING;


-- SOURCE: db/seed-templates.sql
-- Generated by node scripts/build-template-seed.mjs; do not edit manually.
SET search_path TO ulo_uat, public;
INSERT INTO templates (project_id,versi,nama,layout_hbs,partials,kategori_map,page_map,checksum,published)
SELECT id,'1.0.0','SIRIKAP Form ULO','<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>{{aplikasi.nama_singkat}} - Form Uji Aplikasi</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.15; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .header-table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
  .header-table td { border: 0.5pt solid #000; padding: 2mm; font-size: 9pt; vertical-align: middle; }
  .header-left { text-align: left; width: 70%; }
  .header-right { text-align: center; width: 30%; font-weight: bold; }
  .form-table { width: 100%; border-collapse: collapse; margin-bottom: 3mm; font-size: 9pt; }
  .form-table td { border: 0.5pt solid #000; padding: 2mm; vertical-align: top; }
  .section-label { font-weight: bold; text-align: center; background: #f2f2f2; }
  .label { width: 22%; font-weight: bold; }
  .result-table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  .result-table th, .result-table td { border: 0.5pt solid #000; padding: 1.8mm; vertical-align: top; }
  .result-table thead th { background: #d9d9d9; font-weight: bold; text-align: center; }
  .section-row td { background: #f2f2f2; font-weight: bold; text-align: left; }
  .footer-block { margin-top: 6mm; font-size: 9pt; page-break-inside: avoid; }
  .footer-block p { margin-bottom: 1.5mm; }
</style>
</head>
<body>

<div class="page page-1">
  {{> header}}

  <table class="form-table">
    <tr><td colspan="6" class="section-label">SKPD</td></tr>
    <tr>
      <td class="label">Nama SKPD</td><td colspan="3">{{skpd.nama}}</td>
      <td class="label">Kota/Kab/Prov</td><td>{{skpd.kota}}</td>
    </tr>
  </table>

  <table class="form-table">
    <tr><td colspan="6" class="section-label">APLIKASI</td></tr>
    <tr><td class="label">Nama Singkat</td><td colspan="5">{{aplikasi.nama_singkat}}</td></tr>
    <tr><td class="label">Nama Panjang</td><td colspan="5">{{aplikasi.nama_panjang}}</td></tr>
    <tr><td class="label">Alamat URL</td><td colspan="5">{{aplikasi.url}}</td></tr>
  </table>

  <table class="form-table">
    <tr><td colspan="6" class="section-label">Tanggal/Waktu</td></tr>
    <tr><td colspan="6">Dengan ini menyatakan bahwa pada :</td></tr>
    <tr>
      <td class="label">Hari</td><td>{{sesi.hari}}</td>
      <td class="label">Tanggal</td><td>{{sesi.tanggal}}</td>
      <td class="label">Pukul</td><td>{{sesi.pukul}}</td>
    </tr>
    <tr><td class="label">Bertempat di</td><td colspan="5">{{sesi.tempat}}</td></tr>
    <tr><td class="label">Telah dilakukan</td><td colspan="5">{{sesi.jenis}}</td></tr>
    <tr><td colspan="6">Oleh :</td></tr>
    <tr><td colspan="6" class="section-label">Penguji</td></tr>
    <tr>
      <td class="label">Nama Penguji</td><td colspan="3">{{penguji.nama}}</td>
      <td class="label">Jabatan</td><td>{{penguji.jabatan}}</td>
    </tr>
    <tr>
      <td class="label">Surel (Email)</td><td colspan="3">{{penguji.email}}</td>
      <td class="label">Telp.</td><td>{{penguji.telp}}</td>
    </tr>
    <tr><td colspan="6" class="section-label">Saksi</td></tr>
    <tr>
      <td class="label">Nama Saksi</td><td colspan="3">{{saksi.nama}}</td>
      <td class="label">Jabatan</td><td>{{saksi.jabatan}}</td>
    </tr>
    <tr>
      <td class="label">Surel (Email)</td><td colspan="3">{{saksi.email}}</td>
      <td class="label">Telp.</td><td>{{saksi.telp}}</td>
    </tr>
    <tr><td colspan="6" class="section-label">Persetujuan</td></tr>
    <tr><td colspan="6">Dengan ini saya menyatakan bahwa saya bertindak atas nama institusi yang saya wakili dan data hasil pengujian yang terlampir pada bagian lain di dokumen ini telah saya isi dengan benar.</td></tr>
    <tr><td colspan="6" class="section-label">Ringkasan Hasil ULO :</td></tr>
    <tr><td colspan="6">Pengujian pertama: {{ringkasan.total}} item diuji – {{ringkasan.lulus}} lulus, {{ringkasan.gagal}} gagal, {{ringkasan.belum}} belum diuji. {{ringkasan.catatan}}</td></tr>
  </table>
</div>

{{#each pages}}
<div class="page page-{{this.pageNumber}}">
  {{> header}}

  <table class="result-table">
    <thead>
      <tr>
        <th style="width:8%">No</th>
        <th style="width:40%">Kebutuhan/Pengujian</th>
        <th style="width:52%">Hasil/Catatan</th>
      </tr>
    </thead>
    <tbody>
      {{#each this.rows}}
        {{#if this.isSection}}
          <tr class="section-row"><td colspan="3">{{this.text}}</td></tr>
        {{else}}
          <tr><td>{{this.no}}</td><td>{{this.kebutuhan}}</td><td>{{this.hasil}}</td></tr>
        {{/if}}
      {{/each}}
    </tbody>
  </table>

  {{#if this.isLastPage}}
  <div class="footer-block">
    <p><strong>Ringkasan Hasil ULO :</strong><br/>
    Pengujian pertama: {{@root.ringkasan.total}} item – {{@root.ringkasan.lulus}} lulus,
    {{@root.ringkasan.gagal}} gagal, {{@root.ringkasan.belum}} belum diuji.
    {{@root.ringkasan.catatan}} {{@root.ringkasan.temuan}}</p>
    <p>{{@root.sesi.tanggal}}</p>
    <p>Diuji oleh :</p>
    <p>{{@root.penguji.nama}}<br/>NIP. {{@root.penguji.nip}}</p>
  </div>
  {{/if}}
</div>
{{/each}}

</body>
</html>
','{"header":"<table class=\"header-table\">\n  <tr>\n    <td class=\"header-left\">{{project.instansi}}</td>\n    <td class=\"header-right\">{{project.kode_form_1}}</td>\n  </tr>\n  <tr>\n    <td class=\"header-left\">{{project.bidang}}</td>\n    <td class=\"header-right\">{{project.kode_form_2}}</td>\n  </tr>\n  <tr>\n    <td class=\"header-left\">{{project.form_title}}</td>\n    <td class=\"header-right\">{{project.kode_form_3}}</td>\n  </tr>\n</table>\n"}'::jsonb,'{"A":"AKSES & DASHBOARD","B":"PARAMETER - DAFTAR OPD","C":"PARAMETER - KECAMATAN","D":"PARAMETER - GAMPONG","E":"PARAMETER - URUSAN","F":"INOVASI DAERAH - DAFTAR & INDIKATOR","G":"INOVASI DAERAH - TAMBAH","H":"KELITBANGAN & LAPORAN","I":"UTILITY - PENGGUNA & GROUP","J":"UTILITY - OTORITAS & PENGATURAN","K":"NAVIGASI & LAINNYA","L":"GATE ULO YANG BELUM TERBUKTI"}'::jsonb,'{"2":{"fromOrder":1,"toOrder":18},"3":{"fromOrder":19,"toOrder":36},"4":{"fromOrder":37,"toOrder":54},"5":{"fromOrder":55,"toOrder":71}}'::jsonb,'5afc04c2c3e68df454155f611d356aaef384f1c10b33a8f182c732349ea0b785',TRUE
FROM projects WHERE kode='SIRIKAP' ON CONFLICT (project_id,versi) DO NOTHING;
INSERT INTO templates (project_id,versi,nama,layout_hbs,partials,kategori_map,page_map,checksum,published)
SELECT id,'1.0.0','SIMPEG Form ULO','<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>{{aplikasi.nama_singkat}} - Form Uji Aplikasi</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.15; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .header-table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
  .header-table td { border: 0.5pt solid #000; padding: 2mm; font-size: 9pt; vertical-align: middle; }
  .header-left { text-align: left; width: 70%; }
  .header-right { text-align: center; width: 30%; font-weight: bold; }
  .form-table { width: 100%; border-collapse: collapse; margin-bottom: 3mm; font-size: 9pt; }
  .form-table td { border: 0.5pt solid #000; padding: 2mm; vertical-align: top; }
  .section-label { font-weight: bold; text-align: center; background: #f2f2f2; }
  .label { width: 22%; font-weight: bold; }
  .result-table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  .result-table th, .result-table td { border: 0.5pt solid #000; padding: 1.8mm; vertical-align: top; }
  .result-table thead th { background: #d9d9d9; font-weight: bold; text-align: center; }
  .section-row td { background: #f2f2f2; font-weight: bold; text-align: left; }
  .footer-block { margin-top: 6mm; font-size: 9pt; page-break-inside: avoid; }
  .footer-block p { margin-bottom: 1.5mm; }
</style>
</head>
<body>

<div class="page page-1">
  {{> header}}

  <table class="form-table">
    <tr><td colspan="6" class="section-label">SKPD</td></tr>
    <tr>
      <td class="label">Nama SKPD</td><td colspan="3">{{skpd.nama}}</td>
      <td class="label">Kota/Kab/Prov</td><td>{{skpd.kota}}</td>
    </tr>
  </table>

  <table class="form-table">
    <tr><td colspan="6" class="section-label">APLIKASI</td></tr>
    <tr><td class="label">Nama Singkat</td><td colspan="5">{{aplikasi.nama_singkat}}</td></tr>
    <tr><td class="label">Nama Panjang</td><td colspan="5">{{aplikasi.nama_panjang}}</td></tr>
    <tr><td class="label">Alamat URL</td><td colspan="5">{{aplikasi.url}}</td></tr>
  </table>

  <table class="form-table">
    <tr><td colspan="6" class="section-label">Tanggal/Waktu</td></tr>
    <tr><td colspan="6">Dengan ini menyatakan bahwa pada :</td></tr>
    <tr>
      <td class="label">Hari</td><td>{{sesi.hari}}</td>
      <td class="label">Tanggal</td><td>{{sesi.tanggal}}</td>
      <td class="label">Pukul</td><td>{{sesi.pukul}}</td>
    </tr>
    <tr><td class="label">Bertempat di</td><td colspan="5">{{sesi.tempat}}</td></tr>
    <tr><td class="label">Telah dilakukan</td><td colspan="5">{{sesi.jenis}}</td></tr>
    <tr><td colspan="6">Oleh :</td></tr>
    <tr><td colspan="6" class="section-label">Penguji</td></tr>
    <tr>
      <td class="label">Nama Penguji</td><td colspan="3">{{penguji.nama}}</td>
      <td class="label">Jabatan</td><td>{{penguji.jabatan}}</td>
    </tr>
    <tr>
      <td class="label">Surel (Email)</td><td colspan="3">{{penguji.email}}</td>
      <td class="label">Telp.</td><td>{{penguji.telp}}</td>
    </tr>
    <tr><td colspan="6" class="section-label">Saksi</td></tr>
    <tr>
      <td class="label">Nama Saksi</td><td colspan="3">{{saksi.nama}}</td>
      <td class="label">Jabatan</td><td>{{saksi.jabatan}}</td>
    </tr>
    <tr>
      <td class="label">Surel (Email)</td><td colspan="3">{{saksi.email}}</td>
      <td class="label">Telp.</td><td>{{saksi.telp}}</td>
    </tr>
    <tr><td colspan="6" class="section-label">Persetujuan</td></tr>
    <tr><td colspan="6">Dengan ini saya menyatakan bahwa saya bertindak atas nama institusi yang saya wakili dan data hasil pengujian yang terlampir pada bagian lain di dokumen ini telah saya isi dengan benar.</td></tr>
    <tr><td colspan="6" class="section-label">Ringkasan Hasil ULO :</td></tr>
    <tr><td colspan="6">Pengujian pertama: {{ringkasan.total}} item diuji – {{ringkasan.lulus}} lulus, {{ringkasan.gagal}} gagal, {{ringkasan.belum}} belum diuji. {{ringkasan.catatan}}</td></tr>
  </table>
</div>

{{#each pages}}
<div class="page page-{{this.pageNumber}}">
  {{> header}}

  <table class="result-table">
    <thead>
      <tr>
        <th style="width:8%">No</th>
        <th style="width:40%">Kebutuhan/Pengujian</th>
        <th style="width:52%">Hasil/Catatan</th>
      </tr>
    </thead>
    <tbody>
      {{#each this.rows}}
        {{#if this.isSection}}
          <tr class="section-row"><td colspan="3">{{this.text}}</td></tr>
        {{else}}
          <tr><td>{{this.no}}</td><td>{{this.kebutuhan}}</td><td>{{this.hasil}}</td></tr>
        {{/if}}
      {{/each}}
    </tbody>
  </table>

  {{#if this.isLastPage}}
  <div class="footer-block">
    <p><strong>Ringkasan Hasil ULO :</strong><br/>
    Pengujian pertama: {{@root.ringkasan.total}} item – {{@root.ringkasan.lulus}} lulus,
    {{@root.ringkasan.gagal}} gagal, {{@root.ringkasan.belum}} belum diuji.
    {{@root.ringkasan.catatan}} {{@root.ringkasan.temuan}}</p>
    <p>{{@root.sesi.tanggal}}</p>
    <p>Diuji oleh :</p>
    <p>{{@root.penguji.nama}}<br/>NIP. {{@root.penguji.nip}}</p>
  </div>
  {{/if}}
</div>
{{/each}}

</body>
</html>
','{"header":"<table class=\"header-table\">\n  <tr>\n    <td class=\"header-left\">{{project.instansi}}</td>\n    <td class=\"header-right\">{{project.kode_form_1}}</td>\n  </tr>\n  <tr>\n    <td class=\"header-left\">{{project.bidang}}</td>\n    <td class=\"header-right\">{{project.kode_form_2}}</td>\n  </tr>\n  <tr>\n    <td class=\"header-left\">{{project.form_title}}</td>\n    <td class=\"header-right\">{{project.kode_form_3}}</td>\n  </tr>\n</table>\n"}'::jsonb,'{"A":"AUTENTIKASI & OTORISASI","B":"DATA PEGAWAI","C":"MUTASI & PROMOSI","D":"ABSENSI","E":"LAPORAN KEPEGAWAIAN","F":"UTILITY"}'::jsonb,'{"2":{"fromOrder":1,"toOrder":18},"3":{"fromOrder":19,"toOrder":36},"4":{"fromOrder":37,"toOrder":54},"5":{"fromOrder":55,"toOrder":71}}'::jsonb,'5afc04c2c3e68df454155f611d356aaef384f1c10b33a8f182c732349ea0b785',TRUE
FROM projects WHERE kode='SIMPEG' ON CONFLICT (project_id,versi) DO NOTHING;


-- SOURCE: db/seed-sirikap-items.sql
SET search_path TO ulo_uat, public;
INSERT INTO aplikasi (project_id, nama_singkat, nama_panjang, url)
SELECT p.id, 'SIRIKAP', 'Sistem Inovasi dan Riset Kabupaten Pidie',
       'https://sirikap.dev-government.my.id/'
FROM projects p WHERE p.kode='SIRIKAP';

INSERT INTO ulo_sesi (project_id, aplikasi_id, template_id, hari, tanggal, pukul, tempat, jenis,
  penguji_nama, penguji_jabatan, penguji_email, penguji_telp, penguji_nip,
  catatan, temuan, status)
SELECT p.id, a.id, t.id, 'Rabu', '2026-11-18', '9:00', 'Pengujian daring',
       'Uji Layak Operasi (ULO) – uji fungsional non-destruktif',
       'Saipul Bahri, S.Kom','Penata Layanan Operasional',
       'saipulbahri@acehprov.go.id','0823 6220 6200','19880511 202521 1 045',
       'CREATE tidak persisten sehingga DELETE tidak dapat diuji.',
       'Temuan: unduh panduan, chart/fullscreen, filter tahun Kecamatan, Group Otorisasi.',
       'DRAFT'
FROM aplikasi a, templates t, projects p
WHERE a.nama_singkat='SIRIKAP' AND p.kode='SIRIKAP'
  AND t.project_id=p.id AND a.project_id=p.id AND t.versi='1.0.0';

WITH s AS (
  SELECT s.id FROM ulo_sesi s JOIN aplikasi a ON a.id=s.aplikasi_id
  WHERE a.nama_singkat='SIRIKAP'
), items(no,kat,keb,hasil,status,urutan) AS (VALUES
 ('D1','A','Dashboard: kartu statistik inovasi, riset, digital, non-digital','4 kartu tampil: Inovasi 112, Riset 8, Digital 30, Non Digital 82; angka belum direkonsiliasi.','PASS',1),
 ('D2','A','Dashboard: opsi grafik progres tahapan inovasi','Mode Doughnut/Pie dapat dipilih, canvas kosong.','FAIL',2),
 ('D3','A','Dashboard: opsi grafik 7 besar inovasi','Mode Line dapat dipilih, canvas kosong.','FAIL',3),
 ('D4','A','Dashboard: unduh panduan','Tombol tidak memicu request; tidak ada handler.','FAIL',4),
 ('D5','A','Dashboard: panel customizer','Panel tema terbuka; penyimpanan preferensi tidak diuji.','PASS',5),
 ('D6','A','Dashboard: tombol layar penuh','Tidak menghasilkan document.fullscreenElement.','FAIL',6),
 ('P1','B','Daftar OPD: navigasi dan tampilan','Halaman dan tabel terbuka.','PASS',7),
 ('P2','B','Daftar OPD: struktur kolom','Aksi, OPD, Nama OPD, Pengguna Anggaran.','PASS',8),
 ('P3','B','Daftar OPD: pencarian','Filter ''DINAS'' 82→20.','PASS',9),
 ('P4','B','Daftar OPD: pagination','Bekerja 1-10 ke 11-20.','PASS',10),
 ('P5','B','Daftar OPD: buka form tambah','Modal tampil lengkap.','PASS',11),
 ('P6','B','Daftar OPD: tahun anggaran','Filter 2025 → no data, bekerja.','PASS',12),
 ('P7','B','Daftar OPD: tutup form','Modal tertutup tanpa simpan.','PASS',13),
 ('P8','C','Daftar Kecamatan: akses','Halaman terbuka.','PASS',14),
 ('P9','C','Daftar Kecamatan: kolom','Aksi, Kode, Kecamatan.','PASS',15),
 ('P10','C','Daftar Kecamatan: pencarian','Filter ''BATEE'' 23→1.','PASS',16),
 ('P11','C','Daftar Kecamatan: form tambah','Simpan balas sukses, recordsTotal tetap 23.','FAIL',17),
 ('P12','C','Daftar Kecamatan: form ubah','Modal terbuka, ditutup tanpa perubahan.','PASS',18),
 ('P13','C','Daftar Kecamatan: tahun anggaran','Ganti tahun tidak mengubah data.','FAIL',19),
 ('P14','D','Daftar Gampong: akses','Judul ''Daftar Kelurahan'', bagian ''Daftar Gampong''.','PASS',20),
 ('P15','D','Daftar Gampong: kolom','Aksi, Kode, Kelurahan.','PASS',21),
 ('P16','D','Daftar Gampong: form tambah','Kecamatan, Kode Gampong, Nama Gampong.','PASS',22),
 ('P17','D','Daftar Gampong: filter Kecamatan','Dropdown hanya ''Keseluruhan''.','FAIL',23),
 ('P18','D','Daftar Gampong: tutup form','Modal tertutup.','PASS',24),
 ('P19','E','Daftar Urusan: akses','Halaman terbuka.','PASS',25),
 ('P20','E','Daftar Urusan: kolom','Aksi, Nama Urusan.','PASS',26),
 ('P21','E','Daftar Urusan: form tambah','Modal terbuka.','PASS',27),
 ('P22','E','Daftar Urusan: form ubah','Modal terbuka.','PASS',28),
 ('P23','E','Daftar Urusan: tutup modal','Ditutup tanpa simpan.','PASS',29),
 ('I1','F','Daftar Inovasi: akses','Halaman terbuka.','PASS',30),
 ('I2','F','Daftar Inovasi: kolom','Rincian, OPD, Nama Inovasi, Skor, Waktu, Option.','PASS',31),
 ('I3','F','Daftar Inovasi: pilihan baris','10/25/50/100 tersedia.','PASS',32),
 ('I4','F','Daftar Inovasi: ekspor','XLSX 18.842 byte, PDF 75.513 byte valid.','PASS',33),
 ('I5','F','Daftar Inovasi: filter tahun','Ganti 2025 → kosong, bekerja.','PASS',34),
 ('I6','F','Daftar Inovasi: pagination','Next menggeser baris.','PASS',35),
 ('I7','F','Daftar Inovasi: perluas','Baris diperluas tampil indikator.','PASS',36),
 ('I8','F','Daftar Inovasi: indikator','4 baris indikator dengan Upload/Delete.','PASS',37),
 ('I9','F','Daftar Inovasi: modal upload','Modal terbuka.','PASS',38),
 ('I10','F','Daftar Inovasi: tutup modal','Modal tertutup tanpa unggah.','PASS',39),
 ('I11','G','Tambah Inovasi: form','Form terbuka.','PASS',40),
 ('I12','G','Tambah Inovasi: validasi kosong','Klik Send memicu validasi.','PASS',41),
 ('I13','G','Tambah Inovasi: form tetap','Form tetap terbuka.','PASS',42),
 ('K1','H','Kelitbangan: menu','Menu terbuka.','PASS',43),
 ('K2','H','Kelitbangan: fungsi riset','8 baris riset, modal upload terbuka.','PASS',44),
 ('L1','H','Laporan: menu','Halaman terbuka lengkap filter.','PASS',45),
 ('L2','H','Laporan: jenis/filter','Ganti tahun 2020 mengubah tampilan.','PASS',46),
 ('L3','H','Laporan: ekspor','PDF 200, Excel 200 attachment.','PASS',47),
 ('U1','I','Utility User: daftar','Tabel dengan Action, Username, Full Name, Group.','PASS',48),
 ('U2','I','Utility User: form tambah','Modal Create User terbuka.','PASS',49),
 ('U3','I','Utility User: struktur form','Nama, Username, Password, OPD, Group, Is Admin.','PASS',50),
 ('U4','I','Utility User: pilihan Is Admin','''lya, saya admin''/''Bukan''.','PASS',51),
 ('U5','I','Utility User: form tambah group','Simpan tidak menambah group.','FAIL',52),
 ('U6','I','Utility User: daftar group','Group tampil, hak akses belum diuji.','PASS',53),
 ('U7','I','Utility User: edit/hapus group','Modal edit terbuka, tidak ada perubahan.','PASS',54),
 ('U8','I','Utility User: tutup form','Modal tertutup.','PASS',55),
 ('U9','J','Otoritas Menu: akses','Dropdown Group Otorisasi kosong, matriks tidak termuat.','FAIL',56),
 ('U10','J','Log Login','982 entri, filter & ekspor tampil.','PASS',57),
 ('U11','J','Konfigurasi','Field daerah, kota, ta_list, informasi, tombol.','PASS',58),
 ('N1','K','Sidebar: menu utama','Struktur terlihat.','PASS',59),
 ('N2','K','Sidebar: submenu Parameter','OPD, Kecamatan, Gampong, Urusan.','PASS',60),
 ('N3','K','Sidebar: submenu Inovasi','Daftar dan Tambah Inovasi.','PASS',61),
 ('N4','K','Sidebar: submenu Utility','User, Otoritas, Log Login, Konfigurasi.','PASS',62),
 ('N5','K','Header: ikon & profil','Logo, pencarian, fullscreen, profil.','PASS',63),
 ('N6','K','Responsive/sidebar','Kontrol collapse terlihat, respon tidak terbukti.','FAIL',64),
 ('O1','K','Pelaporan: menu','Menu terlihat di sidebar.','PASS',65),
 ('O2','K','Pengaturan: menu','Menu terlihat di sidebar.','PASS',66),
 ('X1','L','CRUD: simpan & baca ulang','CREATE GAGAL, recordsTotal tetap.','FAIL',67),
 ('X2','L','CRUD: ubah, hapus, pemulihan','UPDATE berhasil, DELETE tidak dapat diuji.','FAIL',68),
 ('X3','L','Hak akses: role','Dropdown otorisasi kosong, tidak ada akun non-admin.','FAIL',69),
 ('X4','L','Sesi: logout, expiry, unauthorized','Logout mengakhiri sesi, redirect login.','PASS',70),
 ('X5','L','Laporan: render & ekspor','PDF & Excel terverifikasi.','PASS',71)
)
INSERT INTO ulo_item (sesi_id, no, kategori, kebutuhan, hasil, status, urutan)
SELECT s.id, i.no, i.kat, i.keb, i.hasil, i.status, i.urutan FROM s, items i;


-- SOURCE: db/seed-simpeg-items.sql
SET search_path TO ulo_uat, public;
INSERT INTO aplikasi (project_id, nama_singkat, nama_panjang, url)
SELECT p.id, 'SIMPEG', 'Sistem Informasi Kepegawaian Provinsi Aceh',
       'https://simpeg.acehprov.go.id/'
FROM projects p WHERE p.kode='SIMPEG';

INSERT INTO ulo_sesi (project_id, aplikasi_id, template_id, hari, tanggal, pukul, tempat, jenis,
  penguji_nama, penguji_jabatan, penguji_email, penguji_telp, penguji_nip,
  catatan, temuan, status)
SELECT p.id, a.id, t.id, 'Kamis','2026-11-19','10:00','Pengujian daring',
       'Uji Layak Operasi (ULO) – uji fungsional non-destruktif',
       'Rina Marlina, S.Kom','Analis Sistem Informasi',
       'rina@acehprov.go.id','0812 1111 2222','19900101 202001 2 001',
       'Pengujian fungsional modul kepegawaian.',
       'Temuan: ekspor laporan mutasi belum lengkap.','DRAFT'
FROM aplikasi a, templates t, projects p
WHERE a.nama_singkat='SIMPEG' AND p.kode='SIMPEG'
  AND t.project_id=p.id AND a.project_id=p.id AND t.versi='1.0.0';

WITH s AS (
  SELECT s.id FROM ulo_sesi s JOIN aplikasi a ON a.id=s.aplikasi_id
  WHERE a.nama_singkat='SIMPEG'
), items(no,kat,keb,hasil,status,urutan) AS (VALUES
 ('A1','A','Login: form tampil','Form email/password tampil','PASS',1),
 ('A2','A','Login: validasi kosong','Pesan error muncul','PASS',2),
 ('A3','A','Login: kredensial valid','Redirect dashboard','PASS',3),
 ('A4','A','Login: password salah','Pesan kredensial salah','PASS',4),
 ('A5','A','Login: lockout 5x','Akun terkunci 30 menit','PASS',5),
 ('A6','A','Logout','Sesi berakhir, token invalid','PASS',6),
 ('A7','A','Session expiry','Redirect otomatis','PASS',7),
 ('A8','A','Password reset email','Email terkirim','PASS',8),
 ('A9','A','Password reset token','Token expire 1 jam','PASS',9),
 ('A10','A','OTP 2FA login','Kode OTP terkirim','FAIL',10),
 ('A11','A','OTP 2FA verify','Kode valid lanjut','FAIL',11),
 ('A12','A','Role-based menu','Menu sesuai role','PASS',12),
 ('B1','B','Daftar pegawai: akses','Halaman terbuka','PASS',13),
 ('B2','B','Daftar pegawai: kolom','NIP, Nama, Jabatan, Unit, Status','PASS',14),
 ('B3','B','Daftar pegawai: cari NIP','Filter bekerja','PASS',15),
 ('B4','B','Daftar pegawai: cari nama','Filter bekerja','PASS',16),
 ('B5','B','Daftar pegawai: pagination','Navigasi bekerja','PASS',17),
 ('B6','B','Daftar pegawai: sort','Asc/desc bekerja','PASS',18),
 ('B7','B','Detail pegawai: tab','5 tab tampil','PASS',19),
 ('B8','B','Detail pegawai: foto','Foto tampil','PASS',20),
 ('B9','B','Edit pegawai: form','Pre-fill data','PASS',21),
 ('B10','B','Edit pegawai: validasi','Field wajib divalidasi','PASS',22),
 ('B11','B','Edit pegawai: simpan','Data persists','PASS',23),
 ('B12','B','Edit pegawai: audit','Perubahan tercatat','PASS',24),
 ('B13','B','Tambah pegawai: form','Form tampil','PASS',25),
 ('B14','B','Tambah pegawai: simpan','Record muncul','PASS',26),
 ('B15','B','Hapus pegawai: konfirmasi','Dialog tampil','PASS',27),
 ('B16','B','Hapus pegawai: soft delete','Data non-aktif','PASS',28),
 ('B17','B','Import CSV pegawai','File terproses','FAIL',29),
 ('B18','B','Export pegawai CSV','File valid','PASS',30),
 ('C1','C','Mutasi: menu','Terbuka','PASS',31),
 ('C2','C','Mutasi: daftar','Tabel tampil','PASS',32),
 ('C3','C','Mutasi: filter status','Filter bekerja','PASS',33),
 ('C4','C','Mutasi: form baru','Form terbuka','PASS',34),
 ('C5','C','Mutasi: validasi','Field divalidasi','PASS',35),
 ('C6','C','Mutasi: simpan draft','Draft tersimpan','PASS',36),
 ('C7','C','Mutasi: submit','Status PENDING','PASS',37),
 ('C8','C','Mutasi: approve','Status APPROVED','PASS',38),
 ('C9','C','Mutasi: reject','Status REJECTED','PASS',39),
 ('C10','C','Promosi: menu','Terbuka','PASS',40),
 ('C11','C','Promosi: kandidat','Tabel tampil','PASS',41),
 ('C12','C','Promosi: skor otomatis','Skor terhitung','PASS',42),
 ('C13','C','Promosi: simpan hasil','Tersimpan','PASS',43),
 ('C14','C','Promosi: ekspor PDF','File terunduh','PASS',44),
 ('C15','C','Promosi: notifikasi email','Email terkirim','FAIL',45),
 ('D1','D','Absensi: akses','Modul terbuka','PASS',46),
 ('D2','D','Absensi: clock-in','Waktu tercatat','PASS',47),
 ('D3','D','Absensi: clock-out','Tombol bekerja','PASS',48),
 ('D4','D','Absensi: riwayat hari ini','5 record','PASS',49),
 ('D5','D','Absensi: rekap bulanan','Rekap tampil','PASS',50),
 ('D6','D','Absensi: filter tanggal','Filter bekerja','PASS',51),
 ('D7','D','Absensi: form izin','Terbuka','PASS',52),
 ('D8','D','Absensi: upload surat','File terunggah','PASS',53),
 ('D9','D','Absensi: approve izin','Status APPROVED','PASS',54),
 ('D10','D','Absensi: GPS check-in','Lokasi terverifikasi','FAIL',55),
 ('D11','D','Absensi: face recognition','Wajah terverifikasi','FAIL',56),
 ('D12','D','Absensi: offline mode','Sync saat online','PASS',57),
 ('E1','E','Laporan: daftar','8 jenis laporan','PASS',58),
 ('E2','E','Laporan: filter periode','Filter bekerja','PASS',59),
 ('E3','E','Laporan: preview','PDF inline','PASS',60),
 ('E4','E','Laporan: ekspor PDF','File valid','PASS',61),
 ('E5','E','Laporan: ekspor Excel','File valid','PASS',62),
 ('E6','E','Laporan: cetak','Print dialog','PASS',63),
 ('E7','E','Laporan: email terjadwal','Email terjadwal','FAIL',64),
 ('E8','E','Laporan: dashboard','6 grafik tampil','PASS',65),
 ('F1','F','User: daftar akun','Tabel tampil','PASS',66),
 ('F2','F','User: tambah','Akun baru tersimpan','PASS',67),
 ('F3','F','User: edit','Perubahan tersimpan','PASS',68),
 ('F4','F','User: reset password','Reset berhasil','PASS',69),
 ('F5','F','Group: daftar','Tabel tampil','PASS',70),
 ('F6','F','Group: assign permission','Permission tersimpan','PASS',71)
)
INSERT INTO ulo_item (sesi_id, no, kategori, kebutuhan, hasil, status, urutan)
SELECT s.id, i.no, i.kat, i.keb, i.hasil, i.status, i.urutan FROM s, items i;

