# Baseline PDF resmi dan audit visual

**Status saat ini: belum ada lampiran PDF resmi yang disetujui.** Pengujian sintetik bukan bukti bahwa template cocok dengan lampiran resmi.

## Gate P2.05

Validator `scripts/validate.py` memerlukan dua PDF berkas yang telah disetujui: baseline resmi dan output lima halaman untuk data UAT yang sama. Persyaratan:
- Tepat **5 halaman** di kedua PDF, ukuran halaman sesuai.
- SSIM setiap halaman **≥0.999** pada 300 DPI.
- Rasio piksel berbeda secara nyata (selisih intensitas >16) **≤0.001** per halaman.
- Teks hasil ekstraksi **identik**, ukuran file berbeda maksimal 5%.
- Hasil pengujian beserta SHA-256 kedua PDF, versi template, commit rilis, identitas peninjau, dan tanggal persetujuan disimpan sebagai bukti.

Jangan menyamakan perbandingan SHA-256 dari Worker dengan SSIM. SHA-256 dapat berbeda walaupun tampilan identik, dan tampilan visual dapat berbeda pada PDF dengan metadata mirip.

## Cara menjalankan secara aman

Gunakan lingkungan build privat/terkontrol yang dapat mengakses PDF baseline resmi; **jangan menaruh berkas berisi data pribadi di repository publik**. Contoh lokal (sesuaikan path):
```bash
python3 scripts/validate.py /secure/official-baseline.pdf /secure/generated-ulo.pdf --dpi 300 --expected-pages 5
```

Workflow normal `Validate PDF` membuktikan algoritma SSIM dan heatmap bekerja menggunakan dokumen sintetik positif dan negatif. Workflow manual `workflow_dispatch` sengaja **gagal** jika `fixtures/lampiran.pdf` tidak tersedia pada checkout: gate acceptance formal tidak boleh dianggap lulus karena sebuah `SKIP`. Untuk berkas baseline rahasia, jalankan validator dari lingkungan privat dan lampirkan bukti hasil secara terbatas kepada reviewer. Jangan membuka gate sebelum baseline dengan provenance yang dapat diverifikasi tersedia.

## Bukti yang belum tersedia

- Dokumen baseline lima halaman dari otoritas pemilik proses.
- Persetujuan formal atas kualitas dan isi template.
- Hasil perbandingan visual untuk PDF produksi dengan data 71 test case aktual.
