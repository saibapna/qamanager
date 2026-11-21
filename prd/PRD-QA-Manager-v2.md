# Product Requirements Document (PRD) — QA Manager 2.0
**Produk:** QA Manager — Platform QA/QC SDLC untuk Instansi Pemerintah  
**Versi dokumen:** 2.0.0-draft | **Tanggal:** 21 November 2026 | **Status:** PROPOSED, belum disetujui pemilik produk  
**Repositori acuan:** saibapna/qamanager, main @ 82b7e5b2cbf9f4725a4ccc37568c067ec716bd86  
**Dokumen teknis pasangan:** [Spesifikasi-Teknis-QA-Manager-v2.md](../spec-tech/Spesifikasi-Teknis-QA-Manager-v2.md)  
**Pemilik kebijakan/otoritas penerimaan:** harus ditetapkan oleh instansi melalui penugasan resmi. Pencantuman nama instansi dalam PRD v1 bukan bukti persetujuan versi ini.

> Konvensi status: **EXISTING-CODE** = terlihat di repositori, bukan berarti sudah lolos uji produksi; **TARGET** = fitur yang harus dibangun; **DEPENDENCY** = memerlukan persetujuan, infrastruktur, atau bukti eksternal; **OUT-OF-SCOPE** = tidak dibangun dalam ruang lingkup ini. Setiap kriteria baru berstatus TARGET kecuali dinyatakan lain.

## 1. Ringkasan eksekutif

QA Manager 2.0 adalah platform pengelolaan kualitas aplikasi pemerintah dari perencanaan, analisis kebutuhan, desain, pembangunan, pengujian, penerimaan, rilis, sampai pemeliharaan. Produk menyatukan **Quality Assurance (QA) proses**, **Quality Control (QC) produk**, dan **Government Acceptance (UAT/ULO/serah-terima)** tanpa mencampurkan peran teknis dengan kewenangan administratif.

**Masalah saat ini.** PRD v1 berkutat pada ULO/UAT: project, template, 71 item SIRIKAP/SIMPEG, PASS/FAIL/BELUM, PDF lima halaman. Kode kemudian berkembang menjadi defect, retest, evidence, approvals, audit, dashboard, dan real-time; namun belum ada model menyeluruh untuk requirement traceability, audit proses QA, quality gate lintas SDLC, release governance, risiko, dan pemisahan kewenangan. README repositori menyatakan status MVP/staging; jangan menganggap seluruh 36 kriteria issue #4 telah terbukti atau produk siap produksi.

**Hasil yang diinginkan.** Setiap keputusan kelayakan pengembangan/rilis dapat ditelusuri ke kebutuhan yang disetujui, bukti pengendalian QA, eksekusi tes QC, temuan, mitigasi risiko, persetujuan pihak berwenang, serta artefak audit yang integritasnya dapat diperiksa.

## 2. Visi, tujuan, dan batas produk

### 2.1 Visi
Satu sumber data mutu aplikasi pemerintah yang **tertelusur, terukur, terkontrol, dan dapat diaudit**, namun tidak menggantikan fungsi auditor formal, sistem pengadaan, maupun penyelenggara sertifikasi elektronik.

### 2.2 Tujuan terukur (target uji coba, bukan capaian eksisting)
1. 100% rilis pilot memiliki keterkaitan ke baseline kebutuhan, hasil evaluasi quality gate, penanggung jawab, dan bukti persetujuan.
2. 100% kasus uji wajib dalam sesi yang difinalisasi memiliki status definitif dan provenance penguji.
3. 100% temuan QC bertipe FAIL memiliki defect/tindak lanjut yang tertaut; tidak ada penutupan diam-diam.
4. 100% keputusan waiver atau risk acceptance memiliki alasan, pemilik risiko, pemberi persetujuan terotorisasi, waktu, dan versi artefak.
5. 0 akses lintas instansi/project tidak sah dalam pengujian keamanan dan regresi.
6. 100% mutasi kritis menghasilkan audit event dan dapat direkonsiliasi.
7. Dasbor memperlihatkan mutu proses QA dan mutu hasil QC **secara terpisah**, bukan hanya angka PASS.

### 2.3 Dalam ruang lingkup
- Manajemen instansi/tenant, unit kerja, aplikasi, project, release, anggota dan kewenangan.
- Baseline kebutuhan, kontrol perubahan, hubungan kebutuhan → risiko → kasus uji → defect → bukti → rilis.
- Katalog standar/prosedur QA, review, temuan ketidaksesuaian proses, tindakan korektif dan quality gate SDLC.
- Rencana tes QC, eksekusi, hasil, defect, severity/priority, retest, regression, evidence dan quality metrics.
- UAT/ULO berbasis snapshot test plan termasuk kompatibilitas 71 kasus serta format PDF resmi yang telah terverifikasi.
- Workflow rekomendasi teknis, keputusan penerimaan pengguna, persetujuan rilis yang dikonfigurasi, dan artefak serah terima.
- Dashboard portfolio, laporan, histori versi, ekspor dan audit trail.
- Keamanan identitas, tenancy, privasi, retensi, pemulihan dan observabilitas.

### 2.4 Bukan ruang lingkup
- Menentukan sah/tidaknya BAST dan memberikan kewenangan PPK secara otomatis.
- Mengganti audit TIK/audit keamanan SPBE formal oleh lembaga/pihak berwenang.
- Mengklaim persetujuan internal sebagai **tanda tangan elektronik tersertifikasi**; integrasi PSrE harus terpisah dan diverifikasi.
- Meng-host aplikasi yang diuji, memindai sistem target tanpa izin, atau mengubah status di sistem pengadaan.
- Mengotomasi putusan hukum/kepatuhan tanpa penanggung jawab manusia.

## 3. Model organisasi, persona, dan pemisahan tugas

| Persona/fungsi | Tujuan dan tanggung jawab | Batas kewenangan |
|---|---|---|
| Platform Operator | Kelola tenant, konfigurasi platform, kesehatan sistem | Tidak otomatis boleh membaca bukti rahasia tenant atau menerima UAT |
| Tenant Administrator / pengelola TIK | Kelola project, anggota, standar dan konfigurasi instansi | Tidak menyetujui hasil pekerjaan hanya karena admin sistem |
| Product Owner / pemilik proses bisnis | Baseline kebutuhan dan memutuskan penerimaan fungsional UAT | Keputusan penerimaan sesuai SK/mandat |
| QA Lead / QA Reviewer | QA Plan, review proses, temuan, CAPA dan rekomendasi gate | Memberi penilaian proses, bukan otoritas BAST |
| QC Lead / Tester | Strategi tes, eksekusi, bukti, defect, retest dan rekomendasi produk | Tidak boleh mengesahkan hasil sendiri bila SoD diperlukan |
| Developer / penyedia | Memperbaiki temuan dan mengirim build/versi | Tidak menutup defect VERIFIED tanpa retest independen |
| Security Reviewer | Mereview kontrol dan risiko keamanan sesuai penugasan | Tidak menggantikan audit keamanan formal |
| Witness | Menyaksikan/memverifikasi sesi penerimaan | Wajib berbeda dari penguji saat kebijakan dual control aktif |
| Release Approver | Menerima atau menolak rekomendasi gate/rilis | Hanya untuk ruang lingkup keputusan yang diotorisasi |
| PPK / pejabat kontraktual | Pengendalian dan serah terima sesuai aturan/kontrak | Akun/role aplikasi **tidak** membentuk kewenangan hukum |
| Auditor / APIP berwenang | Akses read-only berbatas mandat, ekspor bukti audit | Pengawasan formal tetap mengikuti ketentuan instansi |

Satu pengguna boleh menerima beberapa assignment per tenant/project/release, tetapi sistem harus menolak **self-approval** terhadap artefak yang diajukan atau dieksekusi pengguna yang sama bila kebijakan SoD aktif. Persetujuan ditentukan oleh **mandat terdaftar + scope + kebijakan**, bukan string nama jabatan atau atribut bebas.

## 4. Objek domain dan hubungan

- **Tenant/Instansi** → unit kerja → project/produk aplikasi.
- **Project** → lifecycle SDLC, requirement baseline, risk register, QA Plan, QC Test Plan, release.
- **Requirement** memiliki versi, acceptance criteria, pemilik, prioritas, dependensi, dan relasi tes.
- **QA Control / Checklist** → review QA → process finding → CAPA → verifikasi tindakan korektif.
- **Test Case** → versi test plan → test run → result → evidence; FAIL → defect → fix → retest.
- **Release** → build identifier, change set, environment, quality gate evaluation, rekomendasi, approval.
- **UAT/ULO Session** → snapshot plan dan hasil → saksi/approver → report/PDF/BAST supporting package.
- **Audit Event** merekam aktor, waktu, perubahan, sumber, hash dan korelasi antar objek.

Katalog ULO/UAT SIRIKAP/SIMPEG (71 kasus per project) merupakan **template khusus**; jangan mengunci jumlah 71 untuk seluruh instansi atau seluruh jenis testing. Aturan X1–X5 hanya wajib jika policy project mengaktifkannya.

## 5. Tahap SDLC dan Quality Gate

| Tahap | Output QA | Output QC/verifikasi | Exit gate yang diusulkan |
|---|---|---|---|
| G0 Inisiasi | QA Plan, owner, standar, klasifikasi data/risiko | Test strategy awal | Scope, RACI dan kebijakan mutu disetujui |
| G1 Kebutuhan | Review kebutuhan, baseline, traceability | Review testability dan acceptance criteria | Tidak ada requirement kritis ambigu tanpa disposisi |
| G2 Desain | Review arsitektur, interoperabilitas, privacy/security by design | Rencana integration/nonfunctional test | Temuan desain signifikan ditangani/disetujui |
| G3 Implementasi | Evidence code review, CI, branch/change control | Unit, integration, static/security checks sesuai lingkup | Build versioned dan pemeriksaan wajib lulus |
| G4 System/QC | Review pelaksanaan strategi uji dan cakupan | System, regression, accessibility, performance, security testing | Kriteria coverage, defect dan risiko terpenuhi |
| G5 UAT/ULO | Audit readiness dan kelengkapan paket penerimaan | UAT, saksi, retest, bukti, PDF | Pemilik proses bisnis menerima sesuai mandat |
| G6 Rilis | Review change approval, rollback, backup dan SOP | Smoke test pasca deployment | Pejabat/role berwenang menyetujui rilis |
| G7 Operasi | Review insiden, problem, CAPA, perubahan, kualitas layanan | Verifikasi patch/regresi dan SLO | Kriteria penutupan insiden/perubahan terpenuhi |

Gate evaluation menghasilkan PASS, PASS_WITH_ACCEPTED_RISK, FAIL, atau NOT_EVALUATED, dengan alasan, aturan policy yang berlaku, snapshot evidence, aktor dan timestamp. PASS_WITH_ACCEPTED_RISK harus tampak berbeda dari PASS dan tidak tersedia untuk hard-blocker default (contoh akses lintas tenant, temuan kritis belum teratasi).

## 6. Kebutuhan fungsional (FR)

Prioritas: **P0** fondasi wajib, **P1** produk QA/QC penuh, **P2** integrasi/perluasan. Seluruh FR di bawah berstatus TARGET kecuali dicatat sebagai fitur existing yang perlu hardening.

| ID | Prioritas | Kebutuhan dan hasil wajib |
|---|---|---|
| FR-001 | P0 | Tenant/unit kerja/project/app terpisah; tenant A tak membaca/mengubah milik B |
| FR-002 | P0 | Multi-role scoped assignments dengan policy server-side dan validasi SoD |
| FR-003 | P0 | Akun, autentikasi, logout/revoke, MFA/SSO jika dikonfigurasi |
| FR-004 | P0 | Audit event append-only untuk mutasi/approval sensitif |
| FR-005 | P0 | Konfigurasi SDLC template, tahapan, milestone, owner dan deadline |
| FR-006 | P0 | Registry kebijakan gate berversi, immutable setelah efektif |
| FR-007 | P0 | Gate menilai snapshot data, policy, risiko dan approval secara deterministik |
| FR-008 | P0 | Artefak/evidence privat dengan checksum, versi, klasifikasi dan otorisasi |
| FR-009 | P0 | Dashboard terbatasi membership dan scope |
| FR-010 | P0 | Akses read-only auditor sesuai mandat; seluruh ekspor tercatat |
| FR-011 | P1 | Requirement registry ber-ID, versi, prioritas, pemilik, AC |
| FR-012 | P1 | Baseline requirement disetujui; perubahan sesudah baseline melalui change request |
| FR-013 | P1 | Matriks traceability requirement → test → defect → release |
| FR-014 | P1 | QA Plan per project berisi standards, review schedule dan responsibilities |
| FR-015 | P1 | Katalog QA control/checklist per fase dan profil regulasi |
| FR-016 | P1 | Pelaksanaan review QA dengan finding, bukti dan tingkat keparahan |
| FR-017 | P1 | CAPA: tindakan korektif/preventif, owner, due date, verifikasi efektivitas |
| FR-018 | P1 | Risk register, penilaian risiko, mitigasi, residual risk dan owner |
| FR-019 | P1 | QC test strategy dan test plan berversi, independen dari PDF template |
| FR-020 | P1 | Test suite, test case parametrik, step, expected result dan prioritas |
| FR-021 | P0 | Test run snapshot dari versi test plan yang terbit |
| FR-022 | P0 | Test result per eksekusi: NOT_RUN/PASS/FAIL/BLOCKED/NOT_APPLICABLE + alasan |
| FR-023 | P0 | FAIL membuka/menautkan defect dan menyimpan histori immutable |
| FR-024 | P0 | Defect memiliki severity, priority, owner, SLA, status, komentar, evidence |
| FR-025 | P0 | Retest dan regression tidak menimpa hasil uji/defect historis |
| FR-026 | P1 | Test coverage dan trend menurut kebutuhan/risiko/release |
| FR-027 | P0 | UAT/ULO existing tetap mendukung 71 kasus per SIRIKAP/SIMPEG |
| FR-028 | P0 | Aturan finalisasi UAT: plan lengkap, bukti, defect dan X1–X5 jika aktif |
| FR-029 | P0 | Witness/Approver review berbasis revisi dokumen dan no-self-approval |
| FR-030 | P1 | Persetujuan pengguna dan persetujuan rilis dipisahkan; scope formal tercatat |
| FR-031 | P1 | Risk acceptance/waiver hanya oleh aktor berwenang, alasan dan masa berlaku |
| FR-032 | P1 | Release record memiliki commit/build SHA, environment, deployment dan rollback |
| FR-033 | P1 | Smoke test dan post-release verification terhubung ke release |
| FR-034 | P0 | Laporan PDF versioned dengan hash, snapshot dan kontrol akses |
| FR-035 | P0 | Template resmi ULO/UAT lima halaman diuji terhadap baseline resmi |
| FR-036 | P1 | Generator laporan QA, QC, RTM, defect, gate dan release readiness |
| FR-037 | P1 | Dashboard kualitas proses dan kualitas produk dipisah |
| FR-038 | P1 | Notifikasi assignment, defect overdue, gate failed dan approval pending |
| FR-039 | P1 | Pencarian, filter, ekspor CSV/PDF yang tunduk RBAC dan audit |
| FR-040 | P1 | Retention/legal hold, arsip dan bukti pemulihan tanpa penghapusan diam-diam |
| FR-041 | P1 | API versi dan kontrak OpenAPI teruji serta idempotency untuk mutasi kritis |
| FR-042 | P1 | Mekanisme impor data UAT v1 dan ekspor round-trip terverifikasi |
| FR-043 | P2 | Integrasi GitHub/GitLab/CI untuk build/test provenance berizin |
| FR-044 | P2 | SSO OIDC instansi, MFA, dan provisioning identitas sesuai kebijakan |
| FR-045 | P2 | Integrasi PSrE untuk tanda tangan tersertifikasi bila disyaratkan |
| FR-046 | P2 | Webhook/event automation dan integrasi ITSM/monitoring |
| FR-047 | P2 | Template compliance mapping berversi dengan sumber pasal dan evaluasi |
| FR-048 | P2 | Integrasi e-procurement hanya melalui API resmi dan persetujuan pemilik sistem |

### 6.1 Acceptance yang mengikat untuk setiap FR
Masing-masing FR wajib mempunyai: user story, business rule, API/UI, role permission, negative test, audit event, bukti uji, metrik/limit, dan traceability ke gate. FR yang belum memenuhi seluruh paket tidak dapat ditandai DONE. P0/P1/P2 adalah urutan implementasi, bukan pernyataan fitur sudah tersedia.

## 7. Alur bisnis end-to-end

**A. Inisiasi.** Admin instansi membuat project dan menetapkan mandat; pemilik proses bisnis menyetujui kebutuhan, QA menetapkan QA Plan, QC menetapkan test strategy. Sistem membuat gate G0 dengan rule version.

**B. Perubahan kebutuhan.** Requestor mengajukan change request; QA review konsistensi, Product Owner menyetujui baseline baru; semua test terdampak ditandai NEEDS_REVIEW. Tidak ada overwrite requirement yang telah dibaseline.

**C. Quality review.** QA mengerjakan checklist fase, membuka process finding jika prosedur tidak dipenuhi, menetapkan CAPA, lalu reviewer independen memverifikasi tindakan. Process finding **bukan otomatis software defect**, tetapi boleh memiliki relasi keduanya.

**D. Eksekusi QC.** QC Lead menerbitkan test plan, tester membuka run snapshot, mengunggah bukti dan hasil; FAIL membuat defect; developer memperbaiki, tester independen memverifikasi lewat retest. Kasus historis tidak dihapus atau diubah diam-diam.

**E. UAT/ULO.** Pemilik layanan menyetujui ruang lingkup penerimaan; sesi berisi snapshot kasus uji; FAIL wajib defect/disposisi; sistem memblokir finalisasi bila hard gate belum dipenuhi. Saksi dan approver meninjau revisi yang sama. PDF final mengikuti artefak snapshot yang dikunci.

**F. Release.** QA memberi assurance terhadap proses, QC memberi rekomendasi teknis, Security Reviewer menyatakan risiko keamanan, pemilik layanan/pejabat yang ditunjuk memberi keputusan release. Deployment dan smoke test ditautkan. Revisi setelah persetujuan membatalkan signoff lama.

**G. Operasi.** Insiden mengarah ke corrective action atau perubahan berikut; re-release mendapat gate baru; histori tidak dihapus.

## 8. State machine dan aturan kritis

| Entitas | State/transisi | Aturan |
|---|---|---|
| Requirement | DRAFT → REVIEW → BASELINED → SUPERSEDED | BASELINED tak diubah in-place |
| QA Finding | OPEN → ACTION_PLANNED → IMPLEMENTED → VERIFIED / REOPENED | VERIFY oleh QA Reviewer sesuai SoD |
| Defect | OPEN → IN_PROGRESS → FIXED → VERIFIED / REOPENED; WAIVED berdasar policy | WAIVED bukan VERIFIED dan tidak menghapus FAIL |
| Test Run | PLANNED → IN_PROGRESS → COMPLETED → LOCKED | Hasil berubah melalui eksekusi/revisi baru |
| Gate | NOT_EVALUATED → EVALUATING → PASS / PASS_WITH_ACCEPTED_RISK / FAIL | Semua evaluasi historis dipertahankan |
| UAT Session | DRAFT → FINAL → SIGNED (legacy) | Approval harus terikat session revision; perubahan membatalkan signoff |
| Release | DRAFT → CANDIDATE → REVIEWED → APPROVED → DEPLOYED → VERIFIED / ROLLED_BACK | Tidak deploy jika hard-blocker aktif |

**Business rules mandatory:**
- BR-01: Semua resource memiliki tenant scope, project scope bila relevan, dan ownership yang diverifikasi server.
- BR-02: Pengguna tak boleh self-approve mutu, waiver, atau rilis yang dia ajukan bila SoD aktif.
- BR-03: Snapshot test plan dan gate policy tidak boleh berubah selama satu evaluasi/sesi.
- BR-04: Tidak boleh transisi FAIL → PASS tanpa retest yang dapat ditelusuri; WAIVED tetap tercatat sebagai pengecualian.
- BR-05: Ada pemisahan status QC FAIL, QA finding, risk acceptance, dan keputusan administratif.
- BR-06: Hard blocker: tenant isolation breach, defect keamanan kritis yang belum selesai, dan evidence tampering. Tidak ada waiver rutin terhadap hard blocker.
- BR-07: Hanya aktor dengan mandat scope yang dapat mengesahkan penerimaan/rilis; label "PPK" pada akun tidak cukup.
- BR-08: Approval/SIGNED terkait hash snapshot artefak/revisi. Perubahan apa pun setelah approval membuat persetujuan lama tidak berlaku untuk revisi baru.
- BR-09: PDF "identik" dinilai berdasarkan pembandingan visual dan teks ke fixture resmi, **bukan** kesamaan hash dengan PDF yang dirender ulang saja.
- BR-10: Penghapusan evidence bersifat tombstone selama masa retensi; pemusnahan berdasarkan kebijakan retensi/legal hold dan terekam.
- BR-11: Gate policy dan standar berlaku berdasarkan tanggal efektif dan versi; revisi tidak berlaku surut ke keputusan lama.
- BR-12: Template versi legacy tidak dihapus dan ID/data UAT historis tidak diubah oleh migrasi.

## 9. Pelaporan dan indikator mutu

### 9.1 Dashboard QA (mutu proses)
- Kepatuhan checklist per fase = kontrol terpenuhi / kontrol wajib yang dievaluasi.
- Temuan QA terbuka dan overdue; rata-rata waktu CAPA; effectiveness verification.
- Gate pass rate menurut tahap; exception count dan umur risk acceptance.
- Requirement changes setelah baseline dan ketertelusurannya.

### 9.2 Dashboard QC (mutu produk)
- Test execution rate = hasil definitif / total skenario yang applicable.
- Pass rate = PASS / (PASS + FAIL), tampilkan BLOCKED dan NOT_RUN terpisah.
- Requirement coverage = requirement yang terhubung setidaknya satu test valid / requirement applicable.
- Open defect by severity, reopen rate, mean time to verify, regression failure rate.
- UAT readiness, approval pending dan bukti yang belum lengkap.

Setiap dashboard menyatakan **periode, denominator, scope project/release, tanggal snapshot, dan definisi perhitungan**. Tidak memakai satu skor rata-rata untuk menyimpulkan produk "aman" atau "patuh".

## 10. Non-functional requirements (NFR)

| ID | Area | Kriteria penerimaan target (harus diuji) |
|---|---|---|
| NFR-01 | Isolasi | Cross-tenant/cross-project access 0 sukses pada suite test positif/negatif |
| NFR-02 | Keamanan | TLS, secret server-only, cookies Secure/HttpOnly, CSRF defense, revocation, rate limit; review OWASP ASVS |
| NFR-03 | Integritas | Mutasi + event audit dalam transaksi, versi/optimistic locking dan idempotency |
| NFR-04 | Audit | Chain of custody; export berizin; retensi configurable dengan hold, tidak klaim WORM tanpa bukti |
| NFR-05 | Privasi | Data minimization, klasifikasi, redaksi PII, peran pengendali/prosesor dan lokasi penyimpanan disetujui |
| NFR-06 | Aksesibilitas | WCAG 2.1 AA minimal, WCAG 2.2 AA target peningkatan sesuai prioritas |
| NFR-07 | UX | Mobile responsif 375 px, keyboard navigation, pesan error bermakna, waktu WIB konsisten |
| NFR-08 | API | p95 read < 700 ms dan write < 1.2 s pada beban uji pilot yang didefinisikan; bukan klaim capaian |
| NFR-09 | PDF | Request job < 2 s p95, hasil PDF 71 item < 30 s p95 sebagai target awal; target historis 5 s belum terbukti |
| NFR-10 | Availability | Sasaran pilot 99,5% per bulan; target produksi 99,9% setelah infrastruktur dan SLO disetujui |
| NFR-11 | Recovery | Usulan RPO <= 4 jam, RTO <= 8 jam, dibuktikan restore drill dan persetujuan kebijakan |
| NFR-12 | Skala awal | Uji 10 instansi, 100 project, 100.000 kasus uji historis, 50 pengguna bersamaan; perlu load test |
| NFR-13 | Operabilitas | Structured logs dengan correlation ID, alert berjenjang, backup, runbook, rollback, post-deploy smoke |
| NFR-14 | Kompatibilitas | Legacy API/data ULO/UAT tetap dapat dibaca dan migrasi reversible di fase transisi |

Angka NFR adalah target desain, **bukan kemampuan Cloudflare/Supabase yang sudah terukur**. Konfigurasi retensi misalnya lima tahun dari PRD lama harus divalidasi menjadi kebijakan instansi; tidak boleh diklaim kewajiban universal.

## 11. UAT dan Acceptance Criteria berbasis skenario

| ID | Skenario Given / When / Then | Bukti wajib |
|---|---|---|
| AC-01 | Pengguna tenant A mengakses project B → 403/404 tanpa metadata bocor | API integration + DB isolation test |
| AC-02 | Requirement yang telah BASELINED diedit langsung → 409; via change request versi baru | Negative test dan audit event |
| AC-03 | QA finding dibuka → CAPA disetujui dan diverifikasi aktor berbeda | Event chain dan screenshot UI |
| AC-04 | Tester menyimpan FAIL → defect dan event audit dibuat atomik | DB transaction integration |
| AC-05 | Developer menyatakan FIXED tanpa retest → QC status tidak berubah menjadi PASS | Negative transition test |
| AC-06 | Defect WAIVED → alasan, risiko, signoff tetap tersimpan; laporan tampil exception | Waiver audit & PDF report |
| AC-07 | 71 kasus SIRIKAP/SIMPEG dibuat → tepat 71 unik berurutan, semuanya NOT_RUN/BELUM | Regression test |
| AC-08 | Gate X1–X5 diaktifkan dan salah satu gagal → finalisasi UAT ditolak | Rule-specific test |
| AC-09 | Saksi dan approver adalah pelaku yang sama dengan tester saat SoD aktif → ditolak | Abuse-case test |
| AC-10 | Dokumen berubah setelah approval → hash/revision berbeda; approval lama tidak valid | Integration test |
| AC-11 | PDF ULO resmi → jumlah halaman, teks, raster diff dan SSIM lulus terhadap fixture resmi | Report comparators & signed reference |
| AC-12 | Role AUDITOR membuka data sesuai scope → read-only, export tercatat; mutasi 403 | RBAC test |
| AC-13 | Data bukti dihapus UI → hanya tombstone; histori & retensi tetap konsisten | Lifecycle test |
| AC-14 | Release candidate memiliki defect kritis terbuka → hard gate FAIL, deploy approval ditolak | Gate policy test |
| AC-15 | Backup dipulihkan pada lingkungan terisolasi → hash audit/evidence, referensi dan RPO/RTO diverifikasi | Restore-drill report |
| AC-16 | Produksi direfresh pada deep link /projects → tetap HTML, bukan unduhan file | Browser smoke test |
| AC-17 | Login gagal/refresh token replay → throttling/revocation efektif | Security automation |
| AC-18 | Semua status selesai dan gate terpenuhi → laporan readiness berisi QA, QC, risiko, approval dan provenance | End-to-end golden path |

## 12. Milestone dan delivery plan

| Tahap | Lingkup | Exit/definition of done |
|---|---|---|
| M0 Baseline & safety | Freeze baseline, gap audit, security/regulatory decisions, test fixtures | Dataset legacy dibackup; keputusan kritis dicatat |
| M1 Hardening existing ULO/UAT (P0) | Menutup gate issue #4 yang masih belum terbukti, multi-role E2E, PDF resmi, storage | Tidak ada blocker P0 terbuka; signoff E2E & recovery evidence |
| M2 QA Governance (P1) | QA Plan, checklist, finding/CAPA, requirement baseline, RTM, risk | 100% FR QA target lulus AC dan SoD |
| M3 QC Platform (P1) | Generic test suites/runs, defect, regression, metrics | Test history immutable; coverage/dashboards tervalidasi |
| M4 Quality Gates & Release (P1) | Policy engine, gate eval, approvals, release evidence | End-to-end release traceability dan rollback drill |
| M5 Integrations (P2) | SSO/CI/webhook/PSrE/e-procurement sesuai izin | Legal, security dan provider integration signoff |

M1 tidak harus menunggu seluruh P2. **Tidak ada tanggal rilis yang dijanjikan**; penjadwalan mengikuti kapasitas, bukti, persetujuan instansi, dan dependensi eksternal.

## 13. Risiko dan dependensi penting

| Risiko/dependensi | Dampak | Penanganan |
|---|---|---|
| Kewenangan PPK/BAST tidak terdokumentasi | Approval tampak sah padahal tidak punya mandat | Register mandat/scope, approval administratif terpisah |
| Data pemerintah di layanan global belum dikaji | Ketidaksesuaian kontrak/regulasi/lokasi data | Legal + DPO + pengelola SPBE menilai sebelum pilot produksi |
| R2 belum tersedia/terverifikasi | Bukti membebani PostgreSQL | Storage adapter, quota, private bytea interim, migrasi terukur |
| Fixture PDF resmi belum disahkan | Klaim PDF 1:1 tidak dapat diverifikasi | Fixture bertanda versi, hash, owner dan gate manual |
| PSrE belum terintegrasi | Hanya recorded approval | Label jujur, integrasi certified signing terpisah |
| Legacy data UAT memuat finalisasi bermasalah | Audit history menyesatkan | Migrasi additive dan flag REQUIRES_REVIEW, jangan rewrite |
| Konflik QA/QC dengan developer | Independence hilang | Separation of duties + reviewer independen |
| Kebijakan retensi belum disetujui | Pemusnahan/pengarsipan tidak sah | Retention matrix dan legal hold sebelum otomatisasi |

## 14. Tata kelola regulasi dan standar

Compliance profile disusun bersama unit hukum/pengelola SPBE dan di-versioning; aplikasi **mencatat eviden** dan bukan penerbit sertifikasi patuh. Pemetaan awal: Perpres 95/2018 (SPBE dan audit TIK); Perpres 132/2022 (arsitektur SPBE); Perpres 82/2023 hanya sesuai cakupan aplikasi prioritas; Peraturan BSSN 4/2021 (manajemen keamanan SPBE); Peraturan BSSN 8/2024 (audit keamanan SPBE); UU 27/2022 (PDP); PP 71/2019 (PSTE dan tanda tangan elektronik); Perpres 16/2018 sebagaimana diubah sampai Perpres 46/2025 (pengadaan). ISO/IEC 25010, ISO/IEC/IEEE 29119, OWASP ASVS, WCAG menjadi **referensi standar teknis**, bukan pernyataan wajib dari setiap regulasi.

Referensi:
- https://peraturan.bpk.go.id/Details/96913/perpres-no-95-tahun-2018
- https://peraturan.bpk.go.id/Details/233483/perpres-no-132-tahun-2022
- https://peraturan.bpk.go.id/Details/273981/perpres-no-82-tahun-2023
- https://jdih.kemnaker.go.id/peraturan/detail/2692/peraturan-terkait-nomor-4-tahun-2021
- https://peraturan.bpk.go.id/Details/309821/peraturan-bssn-no-8-tahun-2024
- https://peraturan.bpk.go.id/Details/318647/perpres-no-46-tahun-2025
- https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022
- https://peraturan.bpk.go.id/Download/112816/PP%20Nomor%2071%20Tahun%202019.pdf

## 15. Keputusan desain dan signoff yang masih dibutuhkan

- DEC-01: Pemilik produk resmi, unit pemroses data, dan pejabat persetujuan UAT/rilis/BAST.
- DEC-02: Cakupan tenant: satu instansi per tenant atau organisasi lintas OPD; data sharing policy.
- DEC-03: Klasifikasi data, lokasi pemrosesan/penyimpanan, kontrak cloud dan retensi arsip.
- DEC-04: Apakah PSrE tersertifikasi dibutuhkan pada fase 1 atau fase integrasi.
- DEC-05: Fixture resmi PDF versi yang berlaku berikut hash dan otorisasi penggunaan.
- DEC-06: Ambang quality gate, severity matrix, SLA, risk acceptance dan penguji independen.
- DEC-07: NFR/SLO setelah benchmark, ukuran beban, dan anggaran operasional.

**Status signoff:** belum ada persetujuan formal. PRD menjadi baseline implementasi hanya setelah keputusan di atas disahkan dan revisinya dicatat. Dokumen lama [PRD-ULO-UAT-Manager.md](./PRD-ULO-UAT-Manager.md) tetap menjadi catatan sejarah requirement v1, bukan pengganti PRD ini.
