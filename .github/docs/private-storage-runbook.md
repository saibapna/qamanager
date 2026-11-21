# QA Manager private storage: interim limits and release gates

## Operational status

QA Manager currently stores binary evidence (`ulo_evidence.data`), uploaded template fixtures (`template_fixtures.pdf_data`) and generated PDF outputs (`ulo_output.pdf_data`) as PostgreSQL `bytea` in the private `ulo_uat` schema. This is **not** a replacement for backed-up object storage. Cloudflare R2 access was checked on 21 November 2026; the R2 account API returned HTTP 403 code 10042: "Please enable R2 through the Cloudflare Dashboard." No R2 buckets or backup/restore drill can be claimed.

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

The application locks the project record during file writes to serialize budget accounting across concurrent sessions, then commits each insertion and immutable audit entry together. Physical byte limits apply to stored bytes; evidence soft-delete retains the original bytes for forensic provenance and still counts toward quota. **A tombstone does not free storage capacity.** A budget exhaustion response is HTTP 413, with a descriptive error. Do not directly delete evidence or audit history to make space.

Administrators and auditors can see the project totals via `GET /api/projects/{projectId}/storage-usage` and the project's management dashboard; other roles get HTTP 403 and unauthenticated access gets HTTP 401.

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

1. Activate R2 or an approved private object store, with bucket-level private access, bindings, lifecycle, and quotas.
2. Migrate existing files using content-addressed keys and SHA-256 integrity checks, preserve the API's authorization checks, and keep old records readable until reconciled.
3. Prove backup / restore of a representative PDF and evidence dataset, including session + project metadata and checksum equality.
4. Obtain the official five-page PDF baseline and run authorized visual pixel-diff + SSIM >= 0.999; current SHA-256 byte comparison is not visual equivalence.
5. Enable alerts with an approved notification destination and review actual PDF rendering performance with 71 test items.

Do not mark master audit P2.03/P2.05/P3.07/P3.08 as completed until there is independently reviewed evidence.
