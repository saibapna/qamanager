# Berbagi pakai template BA/ULO/UAT antarproyek

## Model berbagi

- **Pemilik:** hanya `ADMIN` proyek asal yang dapat memasukkan template ke Katalog Bersama.
- **Syarat:** template sumber harus `published` dan proyek asal harus aktif.
- **Penerima:** hanya `ADMIN` proyek tujuan yang dapat melihat katalog dan mengimpor.
- **Impor:** membuat **salinan DRAFT baru** di proyek tujuan dengan versi unik (1–20 karakter). Template sumber tidak diubah dan tetap milik proyek asal.
- **Tinjau sebelum terbit:** sesuaikan `kategori_map`, `page_map`, dan layout dengan test plan proyek penerima sebelum `Publish`. Page map sumber **tidak otomatis cocok** dengan jumlah test case proyek baru.
- **Bukan yang dibagikan:** informasi personal penguji/saksi, akun, hasil test, sesi, retest, defect, fixture baseline PDF, evidence, output PDF, atau tanda tangan.
- **Cabut berbagi:** katalog tidak lagi menawarkan sumber tersebut untuk impor baru; salinan yang sudah diimpor tetap utuh dan dapat digunakan secara independen.
- **Audit:** catatan `TEMPLATE_SHARED`, `TEMPLATE_UNSHARED` dan `TEMPLATE_IMPORTED` menyimpan asal proyek, versi dan SHA-256 template tanpa menyalin bukti pengujian.
- **Immutability:** template yang sudah `published` tidak berubah karena penambahan metadata berbagi dilakukan pada tabel terpisah `ulo_uat.template_shares`.

## Cara menggunakan

1. Dari proyek asal, buka halaman Template yang sudah **Published**, lalu pilih **Bagikan Template**. Periksa dahulu agar layout tidak mengandung data pribadi yang tertanam. Berbagi membutuhkan konfirmasi.
2. Dari proyek tujuan, buka **Katalog Template Bersama**, pilih template dan versi salinan yang belum dipakai, lalu **Salin sebagai DRAFT**.
3. Tinjau layout, kategori serta page map salinan pada editor, simpan penyesuaian, kemudian **Publish** untuk penggunaan sesi baru.
4. Jika tidak ingin membagikan lagi, administrator proyek asal memilih **Hentikan Berbagi**. Sesi dan template penerima sebelumnya tidak berubah.

## Batas keamanan

Route katalog dan impor terikat ke project membership dan `ADMIN`; lintas tenant hanya metadata template yang secara eksplisit di-opt-in. Layout lengkap dibaca hanya oleh backend saat operasi impor terotorisasi. Tidak ada berbagi tabel `ulo_item`, `ulo_sesi`, `template_fixtures`, `ulo_evidence` atau `ulo_output`.

Migrasi `db/migrations/20261121_shared_template_library.sql` harus diterapkan **sebelum** Worker API baru di-deploy. Tabel baru berada dalam skema privat dengan RLS aktif, tanpa grant `anon`/`authenticated` pada Data API, dan trigger validasi sumber published.

## Acceptance

- Impor tanpa persetujuan pemilik tidak dapat dilakukan.
- Template belum published dan proyek asal yang diarsipkan tidak boleh muncul di katalog.
- Duplikasi versi di proyek penerima ditolak.
- Template salinan tetap DRAFT dan memiliki audit asal, tanpa fixture atau hasil sesi.
- Pencabutan berbagi menutup impor berikutnya namun tidak menghapus salinan lama.
