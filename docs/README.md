# QA Manager — Pusat Dokumentasi

Semua **dokumen konseptual dan desain produk** dikelola berdasarkan **domain/fungsi**, bukan disimpan di root proyek. Gunakan halaman ini sebagai **sumber navigasi dokumentasi**. Kode, OpenAPI yang di-generate, fixtures pengujian, dan workflow CI tetap pada lokasi teknis yang sudah dipakai build agar tidak memutus toolchain.

## Mulai dari sini

| Kebutuhan | Dokumen / folder | Kegunaan |
|---|---|---|
| Visi, scope, kebutuhan, peran, KPI | [PRD QA Manager v2](product/prd/PRD-QA-Manager-v2.md) | Target produk, **DRAFT** belum mendapat signoff |
| Arsitektur, data, API, keamanan, migrasi | [Spesifikasi Teknis QA Manager v2](architecture/specifications/Spesifikasi-Teknis-QA-Manager-v2.md) | Target engineering, **DRAFT** belum diimplementasikan seluruhnya |
| Product requirements & histori | [Product](product/README.md) | PRD, roadmap dan product decisions |
| Architecture & technical design | [Architecture](architecture/README.md) | System design, integration design dan arsitektur historis |
| Standar, uji, bukti, PDF | [Quality](quality/README.md) | QA, QC, UAT, pengujian, PDF baselines |
| Kewenangan dan regulasi SPBE | [Governance](governance/README.md) | RACI, policy, compliance mapping dan approval formal |
| Auth, threat model, privacy | [Security](security/README.md) | Security controls, incident/security runbooks |
| API, developer practices dan test engineering | [Engineering](engineering/README.md) | Engineering guides, API reference, CI testing |
| Deployment, backup, incident | [Operations](operations/README.md) | Runbooks operasional, pemulihan, monitoring |
| Keputusan arsitektur/produk | [Decisions](decisions/README.md) | ADR beserta dampak dan sejarah perubahan |
| Format dokumentasi baru | [Templates](templates/README.md) | Template metadata, template ADR dan aturan penamaan |

## Struktur yang direkomendasikan

```text
docs/
├── README.md                        # indeks utama dan aturan dokumentasi
├── product/
│   ├── README.md
│   ├── prd/                          # PRD aktif dan per versi
│   └── archive/                      # PRD historis, tidak disunting diam-diam
├── architecture/
│   ├── README.md
│   ├── specifications/               # technical specification & system design
│   └── archive/                      # arsitektur historis
├── quality/
│   ├── README.md
│   └── pdf/                          # template form, layout dan validasi PDF
├── governance/README.md              # mandat, RACI, policy, regulasi
├── security/README.md                # auth, privasi, threat modeling
├── engineering/README.md             # API contract & developer/testing guide
├── operations/README.md              # deploy, storage, backup, monitoring
├── decisions/
│   ├── README.md
│   └── ADR-template.md
└── templates/
    ├── README.md
    └── document-template.md
```

**Aturan penempatan:** pilih satu domain primer berdasarkan tujuan dokumen. Gunakan link silang untuk referensi domain lain; jangan menyalin dokumen yang sama ke dua tempat. Subfolder baru hanya dibuat saat ada isi riil. Contoh: `docs/quality/uat/`, `docs/security/threat-models/`, `docs/engineering/testing/`, `docs/operations/runbooks/`.

## Kebijakan dokumen (wajib)

1. Setiap dokumen baru mencantumkan **judul, status (DRAFT/REVIEW/APPROVED/DEPRECATED), versi, tanggal, owner, dan referensi**. Jika belum ada owner resmi, tulis **belum ditetapkan**.
2. Nama file **kebab-case** untuk file baru, dengan penanda versi bila perubahan mengubah kontrak (`prd-qa-manager-v2.md` atau `adr-0001-....md`). Nama file legacy dipertahankan agar Git rename/diff mudah ditelusuri.
3. Versi yang sudah APPROVED tidak diubah tanpa change control; buat revisi/ADR dan tautkan histori. Arsip diberi konteks **historis**, tidak menjadi dua sumber kebenaran.
4. GitHub PR mencantumkan **alasan, dokumen terkait, dampak implementasi, owner/reviewer, AC, dan bukti**. Status dokumen tidak sama dengan status fitur sudah terimplementasi.
5. Link internal **relatif** dan dicek dari folder asal; ketika memindah file perbarui seluruh tautan masuk/keluar.
6. Dilarang menyimpan secrets, kredensial, dump database pribadi, laporan rahasia, serta PDF fixture resmi tanpa otorisasi dalam repo publik.
7. Dokumen regulasi harus memisahkan **ketentuan normatif**, **kebijakan instansi**, dan **rekomendasi teknis**. Role aplikasi tidak menciptakan kewenangan hukum PPK/BAST.
8. Dokumentasi aplikasi saat ini tetap berada di README/codebase bila berkaitan erat dengan executable workflow; catat titik masuknya di domain index, kemudian migrasi jika aman.

## Status baselines

- **PRD dan Technical Spec v2**: rancangan target; menunggu review dan keputusan organisasi.
- **ULO/UAT v1, template PDF, dan multi-project v1**: historis dan wajib tetap dipertimbangkan demi kompatibilitas.
- **Master audit issue #4**: [backlog bukti aktual](https://github.com/saibapna/qamanager/issues/4). Tidak otomatis ditutup oleh perapihan dokumen.

Jangan menyamakan pembuatan dokumen, keberhasilan build, atau merge PR dengan **signoff siap produksi**.
