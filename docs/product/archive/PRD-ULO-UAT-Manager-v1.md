# PRD Aplikasi ULO & UAT Manager

[Indeks dokumentasi](../../README.md) · [Arsip Produk](../README.md)

> **DOKUMEN HISTORIS v1.0.** PRD ULO/UAT tetap dipertahankan untuk traceability/kompatibilitas. Usulan cakupan QA/QC seluruh SDLC adalah [PRD QA Manager v2](../prd/PRD-QA-Manager-v2.md). Belum ada signoff formal untuk mengganti baseline ini.

**Versi:** 1.0  
**Tanggal:** 18 November 2026  
**Pemilik Produk:** Dinas Komunikasi, Informatika dan Persandian Aceh

## 1. Latar Belakang
Proses ULO/UAT saat ini manual menggunakan form PDF (S-APP.2.OBJ.3/4/5). Diperlukan
platform digital multi-project yang menghasilkan PDF **1=1** identik dengan lampiran.

## 2. Pengguna & Peran
| Peran | Hak Akses |
|---|---|
| Penguji (TESTER) | Eksekusi uji, catat hasil, unggah bukti |
| Koordinator (ADMIN) | Kelola project, template, gate ULO |
| Saksi (WITNESS) | Verifikasi, tanda tangan digital |
| Approver | Setujui laporan akhir |
| Auditor | Read-only log & laporan |

## 3. Kebutuhan Fungsional
- FR-01..05: CRUD master (SKPD, aplikasi, penguji, saksi)
- FR-06..09: Test plan per kategori A–L
- FR-10..15: Eksekusi (PASS/FAIL/BELUM), bukti, ringkasan otomatis
- FR-16..19: Defect log otomatis dari FAIL
- FR-20..24: Generate PDF 1=1 (5 halaman, template versioned)
- FR-25..28: Auth JWT + RBAC 5 role
- FR-29..31: Sidebar, header, responsive

## 4. Non-Fungsional
- PDF ≤5 detik untuk 71 item
- Akurasi layout: SSIM ≥ 0.999 per halaman
- HTTPS, RBAC, audit immutable 5 tahun
- WCAG 2.1 AA

## 5. Kriteria Penerimaan
- [ ] PDF identik 1=1 (diff = 0)
- [ ] 71 item tercatat (58 PASS / 13 FAIL)
- [ ] Ringkasan otomatis akurat
- [ ] Gate X1–X5 terverifikasi sebelum finalisasi
- [ ] Audit log lengkap

## 6. Arsitektur
Multi-project: Project → Template (versioned) → Aplikasi → Sesi ULO → Output PDF.
Template disimpan di DB (layout_hbs, partials, kategori_map, page_map, checksum).
