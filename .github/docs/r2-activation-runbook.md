# QA Manager — private R2 activation and release gate

**Status as of 2026-11-21:** The linked Cloudflare account's R2 API returns HTTP 403 / code 10042 (`Please enable R2 through the Cloudflare Dashboard`). Bucket creation and live R2 binding cannot proceed until the account owner adds an R2 subscription. No bucket or Worker R2 integration is claimed to be active.

## Proposed resource

| Setting | Value |
| --- | --- |
| Cloudflare account | `78a60ae3f7557946d9a84d7d6dfe976e` |
| Existing Worker | `qamanager` |
| R2 bucket | `qamanager-staging-private` |
| Placement hint | `apac` (not a guaranteed residency boundary) |
| Default storage class | `Standard` |
| Worker binding | `R2_FILES` (type `r2_bucket`) |
| Public r2.dev URL and custom domains | Disabled / none |
| Browser CORS | Not configured; clients only use the authenticated Worker API |
| Automatic deletion | None until retention and legal requirements are approved |

Cloudflare account owner: Dashboard -> Storage & databases -> R2 -> Overview -> complete R2 subscription checkout. This is an interactive billing action. Do not store a card number, Cloudflare API token, or R2 S3 keys in the repository.

## Phase 1 — Resource activation

1. Complete subscription checkout and confirm `GET /accounts/{account_id}/r2/buckets` succeeds (previously 403 / 10042).
2. Create `qamanager-staging-private` in APAC with Standard storage, or use an existing bucket only after checking ownership and tenancy. Use `POST /accounts/{account_id}/r2/buckets` with `{"name":"qamanager-staging-private","locationHint":"apac","storageClass":"Standard"}`.
3. Confirm the bucket has **no public development URL, no custom domains, and no browser-accessible public delivery**. Do not enable CORS or issue S3 credentials for the Worker binding.
4. Set GitHub repository **variable** `QAMANAGER_R2_BUCKET=qamanager-staging-private`. This is not a secret. Keep `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in repository secrets.
5. Trigger the existing Worker deployment on `main` after the binding-readiness PR is merged. The deploy script attaches `R2_FILES` while preserving Hyperdrive, Browser Run, JWT secrets, and ProjectLive Durable Object. It validates the exact bucket on subsequent releases and attempts to roll back unsuccessful deployments.
6. Check `/api/status`: `r2_binding=configured_not_migrated` indicates only that a Worker binding exists. Do **not** mistake this for evidence that UAT files use R2.

## Phase 2 — Controlled migration (separate release)

Current storage is PostgreSQL `bytea`: `ulo_evidence.data`, `template_fixtures.pdf_data`, and `ulo_output.pdf_data`. Existing file downloads enforce project membership and roles. The existing storage quotas, audit events, immutable PDF snapshots, and tombstone semantics must remain valid.

Before writing new application files to R2:

1. Introduce a backward-compatible schema for R2 object keys and source-of-truth state. Do not make the database file bytes nullable until the reader can distinguish an intentional R2 object from corruption.
2. Use **private server-side R2 bindings**. Namespace keys by tenant/project and object kind and incorporate immutable identifiers or SHA-256 digests; prevent cross-tenant key reuse.
3. Upload the object with correct MIME metadata; verify content-length and SHA-256. Store object metadata and the associated audit action together in a database transaction. Handle upload success followed by DB rollback (orphan cleanup) without deleting records needed by concurrent requests.
4. Keep legacy bytea reads available, with a deliberate cutover/rollback flag. Preserve project RBAC on every download, including legacy files. Never enable public buckets, long-lived public URLs, or shared caches for evidence.
5. Migrate a bounded batch of existing PDF, fixture, and evidence objects with idempotent, checksum-verified reconciliation. Verify counts, per-project ownership, and byte identity before any database bytea is cleared.
6. Test one authenticated upload/download for each allowed file type, an unauthorized cross-project download (403/404 as appropriate), immutable audit evidence, PDF comparison, and project quota enforcement. Run a representative backup **and restore** drill with matching checksums.
7. Do not auto-expire or physically delete R2 evidence on user soft-delete. Establish signed-off retention, legal hold, backup, access logs, and documented recovery before configuring lifecycle rules.

Until Phase 2 passes, **R2 is a provisioned capability, not active file storage**. Keep staging limits and release blockers in `.github/docs/private-storage-runbook.md`.

Cloudflare references: https://developers.cloudflare.com/r2/get-started/ and https://developers.cloudflare.com/workers/configuration/multipart-upload-metadata/
