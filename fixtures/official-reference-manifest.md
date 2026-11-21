# Referensi layout resmi BA / ULO / UAT (metadata aman untuk Git publik)

Status: **referensi internal diterima; baseline visual resmi BELUM disetujui**. Dokumen asli tidak boleh dikomit ke repositori publik ini karena memuat tanda tangan, NIP, surel, nomor telepon, dan data pribadi lain. Jangan salin gambar tanda tangan atau menganggap ruang tanda tangan sebagai autentikasi PKI.

## Identitas dan hash sumber privat

| Dokumen yang diunggah | Jenis | Halaman | SHA-256 asli | Profil hasil |
| --- | --- | ---: | --- | --- |
| `20261020_Form-BA-UAT-SIGAP-1.11.5.pdf` | BA UAT SIGAP | 2 | `3ea3c736072ed48d384fca2ac41557aeb803e7fb366e454ef92472be8772be06` | 3 butir hasil pada halaman 2 |
| `BA_ULO_SYEDARA.pdf` | BA ULO SYEDARA | 3 | `47a9260b40ba91aa26ece1c4844dbe0de394fc007ec5084e9177b01be98182e0` | 2 halaman hasil per modul |
| `BA_Hasil_ULO_SIRIKAP_Final_Pengujian_2026-11-06.pdf` | Hasil ULO SIRIKAP | 5 | `58196085e2d3bb7a8404120f81a5e88aaff66e6847470edae160ae836b22ec76` | 71 item: 58 PASS, 13 FAIL, 0 BELUM |

Hash identifikasi berkas, **bukan** hasil autentikasi tanda tangan atau bukti persetujuan instansi. Baseline PDF asli dan tanda tangan hanya disimpan di media privat dengan kebijakan akses dan retensi yang disetujui.

## Elemen formulir yang harus dipertahankan

1. Header tiga baris: Dinas Komunikasi, Informatika dan Persandian Aceh; Bidang Layanan E-Government; Form Uji Aplikasi, dengan kode `S-APP.2.OBJ.3`, `S-APP.2.OBJ.4`, `S-APP.2.OBJ.5`.
2. Tabel identitas SKPD, aplikasi, hari/tanggal/pukul, lokasi, jenis pengujian, penguji, saksi, dan kalimat persetujuan.
3. Ruang pengesahan di bawah tabel identitas dan, apabila sesuai jenis hasil, di halaman terakhir. **Tidak ada tanda tangan pengguna yang disalin/di-generate secara otomatis.**
4. Tabel hasil bertajuk No / Kebutuhan-Pengujian / Hasil-Catatan, kategori berwarna terang, penanda PASS/FAIL/BELUM, dan semua catatan tanpa pemotongan.
5. Ringkasan sesuai data sesi; nomor halaman aktual; jumlah halaman mengikuti ukuran test plan, tidak memaksakan lima halaman pada BA UAT dua halaman atau ULO tiga halaman.
6. Template yang sudah published tetap immutable; gunakan versi baru `1.1.0`, bukan menimpa output lama.

## Ketidakkonsistenan sumber yang tidak boleh diubah diam-diam

- Nama berkas SIGAP mengandung tanggal 20 Oktober, sementara isian utama menyebut 20 September 2026 dan blok pengesahan menyebut 20 Oktober 2026.
- Nama berkas SIRIKAP berakhiran 2026-11-06, tetapi halaman isi menyebut 18 November 2026.
- Form SYEDARA memuat hari/tanggal seperti tertulis; validasi kalender dan otorisasi perubahan tanggal tetap menjadi tanggung jawab pemilik dokumen.

## Gate penerimaan

- Generate kandidat PDF dari **data yang sama** menggunakan layout v1.1.0.
- Verifikasi halaman, susunan kategori, format data dan identitas, simbol status, serta tidak ada teks terpotong.
- Jalankan visual comparison pada baseline asli dalam lingkungan privat: **SSIM >= 0.999 per halaman**, pixel diff sesuai kebijakan, dan pemeriksaan manual pada semua halaman.
- Untuk cetakan yang belum ditandatangani, jangan memberi label `SIGNED` atau membubuhkan gambar tanda tangan yang diambil dari dokumen referensi.
- P2.05 pada Master Issue #4 tetap OPEN sampai ada signoff dan hasil perbandingan visual terhadap baseline resmi.
