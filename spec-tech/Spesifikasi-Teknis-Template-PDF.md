# Spesifikasi Teknis Template PDF 1=1

## Layout Halaman
| Atribut | Nilai |
|---|---|
| Ukuran | A4 portrait (210×297mm) |
| Margin | 15mm semua sisi |
| Font body | Arial 9pt / 1.15 |
| Font tabel | Arial 8pt |
| Border | 0.5pt solid #000 |
| Padding cell | 1.8–2mm |

## Header (Semua Halaman)
Tabel 3 baris × 2 kolom. Kiri instansi/bidang/form, kanan kode S-APP.2.OBJ.3/4/5.

## Halaman 1 — Identitas & Persetujuan
Urutan: SKPD → APLIKASI → Tanggal/Waktu → Penguji → Saksi → Persetujuan → Ringkasan.

## Halaman 2–5 — Tabel Hasil
| Kolom | Lebar |
|---|---|
| No | 8% |
| Kebutuhan/Pengujian | 40% |
| Hasil/Catatan | 52% |

Section row: background #f2f2f2, bold.

## Validasi 1=1
- SSIM ≥ 0.999 per halaman
- Diff piksel ≤ 0.1%
- Teks identik 100%
- Ukuran file ±5% dari baseline

## Engine
Puppeteer (Chromium) + HTML/CSS fixed layout dengan `@page { size: A4; }`.

## Determinisme
- Font embedded (`fonts-liberation` metrik = Arial)
- Page break manual per halaman
- Checksum SHA-256 disimpan untuk audit
