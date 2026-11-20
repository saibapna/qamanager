SET search_path TO ulo_uat, public;
INSERT INTO projects (kode, nama, instansi, bidang) VALUES
  ('SIRIKAP','SIRIKAP - Sistem Inovasi dan Riset Kabupaten Pidie',
   'Badan Perencanaan Pembangunan Daerah Kabupaten Pidie','Bidang Layanan E-Government'),
  ('SIMPEG','SIMPEG - Sistem Informasi Kepegawaian',
   'Badan Kepegawaian Daerah Provinsi Aceh','Bidang Pengembangan Aplikasi') ON CONFLICT (kode) DO NOTHING;
