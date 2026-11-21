# Architecture Documentation

Desain teknis **bagaimana** QA Manager diimplementasikan: deployment, boundaries, data, API, persistence, integration, eventing, migration dan deployment topology. Dokumen aktif harus mengidentifikasi **existing versus target**.

- **Technical Specification v2 (DRAFT):** [QA Manager v2](specifications/Spesifikasi-Teknis-QA-Manager-v2.md)
- **Arsitektur lama:** [Multi-Project v1 (historis)](archive/Arsitektur-Multi-Project-v1.md)
- **Kontrak API yang dieksekusi saat ini:** [OpenAPI](../../api-docs/openapi.yaml), tetap di folder `api-docs/` karena dipakai toolchain.
- **Keputusan teknis lintas domain:** [Decision Records](../decisions/README.md)

**Penempatan dokumen baru:** `specifications/`, kemudian `diagrams/`, `integrations/`, `data/` hanya jika berisi artefak nyata. Sebuah spesifikasi target tidak boleh menggambarkan kemampuan belum diuji sebagai implementasi production.

[Kembali ke indeks](../README.md)
