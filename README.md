# ULO/UAT Manager

Sistem manajemen Uji Layak Operasi (ULO) & User Acceptance Test (UAT) **multi-project**
dengan output PDF **1=1** identik dengan format resmi S-APP.2.OBJ.3/4/5.

## Quick Start (Docker)

```bash
cp .env.example .env
node scripts/generate-user-seed.mjs
docker compose up -d
# API Docs  : http://localhost:3000/docs
# Admin UI  : http://localhost:5173
# Login     : admin@sirikap.id / password123
```

## Login Demo

| Email | Project | Role |
|---|---|---|
| admin@sirikap.id | SIRIKAP | ADMIN |
| tester@sirikap.id | SIRIKAP | TESTER |
| witness@sirikap.id | SIRIKAP | WITNESS |
| admin@simpeg.id | SIMPEG | ADMIN |
| tester@simpeg.id | SIMPEG | TESTER |

Password semua: password123

## Dokumentasi

- PRD: `prd/PRD-ULO-UAT-Manager.md`
- Spesifikasi Teknis PDF 1=1: `spec-tech/Spesifikasi-Teknis-Template-PDF.md`
- Arsitektur Multi-Project: `spec-tech/Arsitektur-Multi-Project.md`
- API Docs: `api-docs/openapi.yaml` atau `http://localhost:3000/docs`

## Alur Utama

1. Login → buat project
2. Upload template (HBS + kategori_map + page_map) + fixture
3. Buat aplikasi & sesi ULO
4. Isi item uji (PASS/FAIL/BELUM)
5. Generate PDF → validasi 1=1 → diff viewer visual
