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
