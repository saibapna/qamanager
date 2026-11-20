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
