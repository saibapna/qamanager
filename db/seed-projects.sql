INSERT INTO projects (kode, nama, instansi, bidang) VALUES
  ('SIRIKAP','SIRIKAP - Sistem Inovasi dan Riset Kabupaten Pidie',
   'Badan Perencanaan Pembangunan Daerah Kabupaten Pidie','Bidang Layanan E-Government'),
  ('SIMPEG','SIMPEG - Sistem Informasi Kepegawaian',
   'Badan Kepegawaian Daerah Provinsi Aceh','Bidang Pengembangan Aplikasi');

-- Template SIRIKAP v1.0.0
INSERT INTO templates (project_id, versi, nama, layout_hbs, partials, kategori_map, page_map, checksum, published)
SELECT id, '1.0.0', 'SIRIKAP Form ULO',
  (SELECT pg_read_file('/app/templates/base-layout.hbs')),
  jsonb_build_object('header', pg_read_file('/app/templates/partials/header.hbs')),
  '{"A":"AKSES & DASHBOARD","B":"PARAMETER - DAFTAR OPD","C":"PARAMETER - KECAMATAN","D":"PARAMETER - GAMPONG","E":"PARAMETER – URUSAN","F":"INOVASI DAERAH – DAFTAR & INDIKATOR","G":"INOVASI DAERAH – TAMBAH","H":"KELITBANGAN & LAPORAN","I":"UTILITY - PENGGUNA & GROUP","J":"UTILITY - OTORITAS & PENGATURAN","K":"NAVIGASI & LAINNYA","L":"GATE ULO YANG BELUM TERBUKTI"}'::jsonb,
  '{"2":{"categories":["A","B","C"],"lastNo":"P14"},"3":{"categories":["D","E","F","G"]},"4":{"categories":["H","I","J","K"],"lastNo":"N2"},"5":{"categories":["K","L"]}}'::jsonb,
  'seed-sirikap-1.0.0', TRUE
FROM projects WHERE kode = 'SIRIKAP';

-- Template SIMPEG v1.0.0
INSERT INTO templates (project_id, versi, nama, layout_hbs, partials, kategori_map, page_map, checksum, published)
SELECT id, '1.0.0', 'SIMPEG Form ULO',
  (SELECT pg_read_file('/app/templates/base-layout.hbs')),
  jsonb_build_object('header', pg_read_file('/app/templates/partials/header.hbs')),
  '{"A":"AUTENTIKASI & OTORISASI","B":"DATA PEGAWAI","C":"MUTASI & PROMOSI","D":"ABSENSI","E":"LAPORAN KEPEGAWAIAN","F":"UTILITY"}'::jsonb,
  '{"2":{"categories":["A"]},"3":{"categories":["B","C"]},"4":{"categories":["D","E","F"]}}'::jsonb,
  'seed-simpeg-1.0.0', TRUE
FROM projects WHERE kode = 'SIMPEG';
