# ULO/UAT Manager

Hono/Cloudflare Workers API + React admin UI (Cloudflare target), dengan Express sebagai backend legacy/lokal untuk Uji Layak Operasi (ULO) / User Acceptance Test (UAT) multi-project. SIRIKAP dan SIMPEG memiliki 71 kasus uji masing-masing. Status `PASS`/`FAIL`/`BELUM` dihitung otomatis.

> **Status:** MVP dalam pengujian. PDF **belum** terbukti identik 1:1 dengan lampiran resmi (fixture baseline belum disediakan). Ini bukan aplikasi yang telah lolos audit produksi.

## Jalankan lokal dengan Docker

```bash
cp .env.example .env
# Gunakan nilai acak untuk JWT_ACCESS_SECRET dan JWT_REFRESH_SECRET di .env.
node scripts/build-template-seed.mjs
npm install
node scripts/generate-user-seed.mjs    # HANYA untuk database demo lokal
node scripts/build-openapi.js
docker compose up -d --build
```

Akses UI: http://localhost:5173 — API: http://localhost:3000 — Swagger: http://localhost:3000/docs. Akun demo **lokal saja**: `admin@sirikap.id` / `password123`. Jangan gunakan akun demo di internet.

Database lokal diinisialisasi dari SQL bernomor di `docker-compose.yml`. Jika mengubah seed setelah volume dibuat, jangan berasumsi PostgreSQL akan menjalankan ulang file init; gunakan migrasi terkontrol. Tidak perlu menyimpan password atau secret di source code.

## Deploy database ke Supabase (PostgreSQL, backend langsung)

1. Pilih atau buat project Supabase khusus QA Manager. Verifikasi terlebih dahulu bahwa Anda tidak mengubah database layanan lain.
2. Jalankan `node scripts/build-template-seed.mjs && node scripts/build-supabase-bootstrap.mjs`. SQL akhir ada di `db/supabase-bootstrap.sql`; SQL tersebut membuat **schema privat `ulo_uat`**, tabel, indeks, dan data uji SIRIKAP/SIMPEG tanpa membuat akun demo.
3. Terapkan SQL tersebut satu kali melalui Supabase SQL Editor atau migration API pada database **kosong**. Jangan ulangi bootstrap pada database dengan data ULO existing.
4. Di backend server (BUKAN React/browser), isi `.env` sebagai berikut:

   ```dotenv
   DATABASE_URL=postgresql://postgres.PROJECT_REF:DB_PASSWORD@SESSION_POOLER_HOST:5432/postgres
   DB_SSL=true
   DB_SCHEMA=ulo_uat
   JWT_ACCESS_SECRET=<random-strong-secret-32-plus-chars>
   JWT_REFRESH_SECRET=<different-random-strong-secret-32-plus-chars>
   NODE_ENV=production
   ```

   Ambil `DATABASE_URL` dari **Supabase Dashboard → Connect → Session Pooler**, jangan gunakan service-role key sebagai password. Hindari memasukkan credential ke GitHub Actions yang tampil dalam log.
5. Buat admin dengan variabel lingkungan `ADMIN_EMAIL`, `ADMIN_PASSWORD` (minimal 12 karakter), `ADMIN_PROJECT_CODE=SIRIKAP`, lalu jalankan `npm run admin:bootstrap` **dari backend tepercaya**. Tidak ada password admin yang otomatis dipublikasikan.
6. Untuk menjalankan API/UI tanpa PostgreSQL lokal: `docker compose -f docker-compose.supabase.yml up -d --build`.

Database hanya diakses lewat server Express (library `pg`), bukan Supabase JS dari browser. Schema privat dan RLS tanpa kebijakan publik menjaga agar tabel tidak terbuka melalui Data API; backend memakai koneksi tepercaya pemilik skema. Gunakan TLS dan kelola kredensial melalui secrets manager untuk deployment nyata.

## Cloudflare Hono (target deployment)

Cloudflare menggunakan **Hono + React** (`admin-ui/functions/api/[[path]].js`, `admin-ui/worker/index.ts`), PostgreSQL lewat Hyperdrive, dan Cloudflare Browser Run untuk membuat PDF. Fitur workflow UAT tersedia pada `admin-ui/functions/api/workflow-routes.js`: test plan kanonis, RBAC, evidence, defect, retest, dan persetujuan internal. File PDF/fixture disimpan privat di Supabase sementara menunggu storage objek. Validasi PDF **baru SHA-256 byte identik, belum SSIM/pixel-perfect**. **Status tetap staging, bukan produksi yang telah disertifikasi**. Lihat [panduan deployment](admin-ui/README-cloudflare.md) dan [master issue #4](https://github.com/saibapna/qamanager/issues/4) untuk verifikasi serta gap yang masih terbuka.

## Pengujian

```bash
npm test                # seluruh tes, membutuhkan npm install
npm run test:unit       # subset tes tanpa dependensi eksternal
npm run openapi         # validasi dan build OpenAPI
npm run build           # PDF demo lengkap 71 item
```

Tes regresi memeriksa 71 item per project, tidak ada item ganda/hilang dalam page-map, serta role access berdasarkan pemilik resource. Validasi PDF piksel menggunakan `fixtures/lampiran.pdf` yang **tidak termasuk dalam repository**. Jumlah halaman fisik output harus diukur di lingkungan Chromium dan dibandingkan dengan fixture resmi; page-map hanya menjamin alokasi data, **bukan** identitas visual.

## Catatan autentikasi Cloudflare

Aplikasi Cloudflare memakai cookie HttpOnly/Secure/SameSite=Strict dan hash PBKDF2 100.000 iterasi yang kompatibel dengan Workerd. Skrip bootstrap lama berbasis Express/Argon2 **hanya untuk backend legacy/lokal**, bukan untuk menyiapkan akun login Cloudflare. Jangan menjalankan ulang bootstrap SQL pada database staging yang sudah berisi data.

## Keamanan & keterbatasan

- Jalankan service API hanya melalui HTTPS reverse proxy; rate limiting dan JWT bukan pengganti HTTPS.
- Pengguna hanya dapat mengakses resource di project yang diizinkan oleh `project_members`. Hak akses dicek lagi ke database, tidak mempercayai role dari request body.
- Token di UI masih tersimpan di localStorage; pertimbangkan migrasi ke cookie `HttpOnly` untuk produksi yang menghadapi risiko XSS.
- Tanda tangan digital, audit retensi 5 tahun, defect log, dan persetujuan multi-level belum lengkap.
- Jangan mengunggah dump produksi yang memuat data pribadi ke GitHub publik. Review data kontak di seed sebelum menyebarkannya.
- Docker build belum diverifikasi di lingkungan ini; dependensi npm memerlukan koneksi registry. Lockfile perlu dihasilkan dan di-commit setelah `npm install` di mesin dengan internet.

## Struktur penting

- `db/schema.sql`, `db/schema-auth.sql` — model data & schema privat.
- `db/seed-templates.sql` — template HBS ter-embed dengan SHA-256.
- `db/supabase-bootstrap.sql` — skrip bootstrap untuk Supabase tanpa demo users.
- `src/auth/authorization.js` — otorisasi berbasis resource.
- `src/layout/page-map.js` — pembagian item tanpa duplikasi.
- `scripts/bootstrap-admin.mjs` — provision admin dengan password rahasia.
- `api-docs/openapi.yaml` — kontrak OpenAPI.
- `prd/`, `spec-tech/` — requirement dan rancangan.

## Cloudflare (Hono, staging)

Untuk deployment Cloudflare, kode Hono berada di
`admin-ui/functions/api/[[path]].ts`; frontend React di-serve oleh Cloudflare
Pages dan Hono menangani `/api/*`. Saat ini hanya `/api/status` dan
`/api/health` aktif (cek database Supabase secara read-only). Endpoint autentikasi,
CRUD, dan PDF sengaja mengembalikan 503 sampai implementasi aman selesai.
Lihat `admin-ui/README-cloudflare.md` untuk langkah deploy dan batasannya.
Jangan menganggap staging sudah layak untuk transaksi ULO produksi.


## Cloudflare staging (Hono)

Cloudflare Pages serves the React frontend and a Hono Pages Function at
`admin-ui/functions/api/[[path]].ts`. Only API status and a protected
read-only Supabase database probe are available. Other API routes intentionally
return HTTP 503 until production authentication and CRUD are integrated.

The complete PDF/validation pipeline still requires a separate runtime with
Chromium/Puppeteer and Python, not a plain Cloudflare Worker. See
`admin-ui/README-cloudflare.md`.
