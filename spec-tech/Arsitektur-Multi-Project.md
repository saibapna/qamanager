# Arsitektur Multi-Project

> **Spesifikasi historis.** Desain target QA/QC SDLC terintegrasi: [Technical Specification QA Manager v2](./Spesifikasi-Teknis-QA-Manager-v2.md). Model existing ULO/UAT harus tetap kompatibel selama migrasi.

## Model Domain

```
Project
├── Template (versioned, immutable setelah publish)
│    ├── layout_hbs, partials
│    ├── kategori_map (JSONB)
│    ├── page_map (JSONB)
│    └── checksum SHA-256
├── Aplikasi (1..N)
│    └── Sesi ULO (1..N)
│         ├── Item Uji
│         ├── Ringkasan (auto-computed)
│         └── Output PDF (versioned)
└── Members (user × role)
```

## Isolasi
- FK `project_id` di semua tabel domain
- TemplateRegistry cache per `(project_id, versi)`
- Fixture baseline per template version
- Row-level access via `project_members`

## Template Registry
`registry.load(projectId, versi)` → compiled Handlebars + maps. Invalidate on publish.

## Generic Page Map (Contoh)
```json
{
  "2": {"categories": ["A","B","C"], "lastNo": "P14"},
  "3": {"categories": ["D","E","F","G"]},
  "4": {"categories": ["H","I","J","K"], "lastNo": "N2"},
  "5": {"categories": ["K","L"]}
}
```

## Multi-Tenant Deployment
Satu instance melayani N project. Isolasi via DB + role, bukan via deployment terpisah.
