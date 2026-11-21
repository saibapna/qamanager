# Standar tanggal dan waktu — QA Manager

## Format tampilan

- PostgreSQL DATE tetap berjenis DATE dan ditampilkan sebagai 18 November 2026.
- Hari dan tanggal: Rabu, 18 November 2026; hari dihitung dari komponen tanggal tanpa menggeser zona waktu.
- Timestamp audit, approval, retest dan riwayat menggunakan Asia/Jakarta: 21 November 2026, 18.41 WIB.
- Jam pengujian berbentuk 09.00 WIB hanya bila nilai jam terstruktur valid; keterangan tekstual disimpan di catatan sumber.
- API dan database tetap menggunakan representasi ISO 8601; jangan tulis tanggal tampilan ke kolom DATE.

## Ketidaksesuaian sumber historis

| Proyek | Hari dalam sumber | Tanggal sumber | Hari kalender | Penanganan |
|---|---|---|---|---|
| SIGAP | Selasa | 20 September 2026 | Minggu | Pertahankan sumber, berikan peringatan |
| SYEDARA | Jum’at | 15 April 2026 | Rabu | Pertahankan sumber, berikan peringatan |
| SIRIKAP | Rabu | 18 November 2026 | Rabu | Tidak perlu peringatan |

Tanggal pengesahan SIGAP adalah 20 Oktober 2026, berbeda dari tanggal pengujian 20 September 2026; kedua tanggal berbeda fungsi dan tidak boleh disamakan tanpa otorisasi pemilik dokumen.

Tidak ada koreksi otomatis pada hari/tanggal historis. Formatter mengubah presentasi, bukan isi database. PDF baru menampilkan tanggal Indonesia dan peringatan di halaman pengesahan ketika hari sumber tidak sesuai kalender. PDF lama tetap utuh dan template published tidak ditimpa.

## Regression tests

- npm test: tests/indonesian-dates.test.js
- cd admin-ui && node --test tests/indonesian-dates-display.test.mjs
- Validate PDF tetap menguji format 2, 3, dan 5 halaman.
