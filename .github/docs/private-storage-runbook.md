# QA Manager private storage: interim limits and release gates

## Operational status

QA Manager supports **private Supabase Storage** (`qamanager-private-files`) for new evidence, fixtures, and generated PDFs when the Cloudflare Worker secret `SUPABASE_STORAGE_SERVICE_ROLE_KEY` is present. The private bucket and active Worker binding were verified on 21 November 2026; `/api/status` returned `pdf_storage=supabase_private_storage`. The Worker alone holds the service-role secret. No browser client receives it, and all file operations must pass the application's project-level authorization before server-side object access.

The backward-compatible migration `db/migrations/20261121_supabase_private_file_storage.sql` adds `storage_key` columns while preserving legacy PostgreSQL `bytea` records. Downloads select the backend per record; **never delete or rewrite legacy binary data as a side effect of enabling object storage**. Read-only SHA-256 and byte-length checks on 21 November verified 6/6 existing evidence and 3/3 existing PDF outputs. At that time the bucket contained 0 stored objects; successful authenticated binary upload/download and cross-project denial remain **unverified**.

Cloudflare R2 remains unactivated (previous account API error 10042), but R2 is not a prerequisite for use of the explicitly selected Supabase private Storage backend. An object-storage activation is **not** proof of backup/restore, five-year retention, PKI signing, or official PDF visual acceptance.

## Enforced interim limits

| Scope | Limit |
| --- | --- |
| Single evidence object | 4 MiB, PDF/PNG/JPEG only |
| Active evidence per UAT item | 10 |
| Evidence bytes per session (all rows) | 64 MiB |
| Evidence bytes per project (all rows) | 256 MiB |
| Single fixture | 5 MiB, PDF |
| Fixtures per template | 10 |
| Fixture bytes per project | 100 MiB |
| Single PDF output | 6 MiB |
| PDF versions per session | 20 |
| Generated PDF bytes per project | 256 MiB |

The application locks the project record during file writes to serialize budget accounting across concurrent sessions, then commits each insertion and immutable audit entry together. The quotas are enforced using persisted metadata (`byte_size`/`size_bytes`) across both object storage and legacy binary records. Evidence soft-delete keeps forensic provenance and continues to count toward quota. **A tombstone does not free storage capacity.** A budget exhaustion response is HTTP 413, with a descriptive error. Do not directly delete evidence or audit history to make space.

Administrators and auditors can see the project totals via `GET /api/projects/{projectId}/storage-usage` and the project's management dashboard; other roles get HTTP 403 and unauthenticated access gets HTTP 401.

## Consistent PDF snapshots

PDF generation records the source UAT session revision, finalization status, and SHA-256 digest of the rendered source HTML as immutable PDF_GENERATED audit metadata. Immediately before storing the rendered PDF, the Worker locks the UAT session and rechecks both revision and status. A concurrent test-case edit, metadata patch, retest, reopen, finalization, or signing results in HTTP 409 and the stale rendered PDF is not archived. Operators can inspect audit metadata in the ADMIN/AUDITOR project Audit Trail, without disclosing the source HTML or personal data.

This prevents a stale output being misrepresented as a current session snapshot. It does not establish pixel-perfect PDF matching, qualified PKI signatures, approval stamps inside the PDF, or repeatable output bytes. The official visual baseline and independent signoff remain required.

## Operational monitoring and cleanup

Inspect Cloudflare Worker logs using `qamanager_pdf_metrics` (project, session, `render_ms`, `total_ms`, page count, output bytes) and error logs `qamanager_pdf_renderer`. The 5-second performance goal remains **unverified** without a production sample of 71-item PDF runs. The renderer performs page layout + Browser Run + PostgreSQL writes; measure end-to-end p50/p95, including cold starts, before establishing a service-level objective.

Read-only database sample:

```sql
SELECT project_id, count(*) AS evidence_objects, sum(byte_size)::bigint AS evidence_bytes
FROM ulo_uat.ulo_evidence
GROUP BY project_id
ORDER BY evidence_bytes DESC;
```

Before purging any binary data, require an approved retention schedule, immutable backup, verified restoration drill with checksum comparison, and an audit trail of access/removal. Five-year log/evidence retention is not guaranteed by the current application or database platform.

## Gate before production sign-off

1. Verify the configured private Supabase Storage bucket, server-only Worker binding, real authenticated binary upload/download and cross-project 403, plus quota and lifecycle controls. Cloudflare R2 is optional.
2. Before any optional migration of legacy binary data, obtain a preservation/rollback plan; compare SHA-256 and sizes for every object and keep old records readable until reconciled.
3. Prove backup / restore of a representative PDF and evidence dataset, including session + project metadata and checksum equality.
4. Obtain the official five-page PDF baseline and run authorized visual pixel-diff + SSIM >= 0.999; current SHA-256 byte comparison is not visual equivalence.
5. Enable alerts with an approved notification destination and review actual PDF rendering performance with 71 test items.

Do not mark master audit P2.03/P2.05/P3.07/P3.08 as completed until there is independently reviewed evidence.
