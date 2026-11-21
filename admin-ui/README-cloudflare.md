# Cloudflare Hono Runtime — QA Manager

A single Cloudflare Worker serves the React SPA and the Hono API. The old Express server is for local/legacy use only.

## Required bindings
- HYPERDRIVE — database connection to the private Supabase ulo_uat schema.
- JWT_ACCESS_SECRET — server-only access-token secret.
- JWT_REFRESH_SECRET — independent server-only refresh-token secret.
- BROWSER — Cloudflare Browser Run binding for PDF generation.
- nodejs_compat — required by node:crypto and the PostgreSQL client.

The source is in admin-ui/functions/api/[[path]].js. The SPA worker entrypoint is admin-ui/worker/index.ts.

## Build and deployment
Run in admin-ui: npm install --no-audit --no-fund; npm run build; npm run build:worker.

Pushes to `main` trigger GitHub Actions to build and **automatically deploy** the Hono Worker, provided repository Cloudflare secrets are configured. The deploy script preserves all four production bindings and smoke-tests `/projects` and `/api/status`. For every release, additionally run authenticated UAT workflow tests; build and anonymous health checks alone do not establish production readiness.

## Migration and workflow
Apply db/migrations/20261121_master_audit_workflow.sql before deploying this version. The migration preserves existing UAT sessions and output history, adds immutable audit triggers, test_plan_items, item events, defects, retests, evidence, approvals, people and authentication rate-limit counters.

Project administrators manage the canonical test plan. Once the project has sessions, the plan is immutable through the API. New sessions copy the entire plan. PDF/fixtures/evidence are stored as bounded private bytea for staging; object storage and lifecycle policy are still required for larger production volumes.

## Security
- Login uses password PBKDF2-SHA256 at 100000 iterations, compatible with Cloudflare Workers.
- Browser tokens use Secure HttpOnly SameSite=Strict cookies; client authentication state is memory-only.
- Refresh tokens are rotated and server logout revokes the refresh token.
- Cross-origin state-changing requests are blocked.
- Rate limiting is backed by PostgreSQL hashed IP/account keys.
- Authorization resolves tenant membership and role on the server.

## Interim private storage and metrics

Cloudflare R2 is not currently enabled for the connected account (R2 API reports 403 / 10042). Evidence, fixtures, and PDFs therefore remain in private PostgreSQL `bytea` under explicit per-object, per-session, per-template, and per-project limits. Evidence soft-deletes retain bytes and still consume quota. Administrator/Auditor storage capacity is visible on `/projects/:id/manage`, backed by `GET /api/projects/:projectId/storage-usage`. Worker-generated PDF log `qamanager_pdf_metrics` contains render and total latency in milliseconds; the 5-second PDF benchmark is **not yet verified**. See `.github/docs/private-storage-runbook.md` for limits, R2 enablement, controlled migration, backup/restore and retention requirements.
## Release blockers
See GitHub issue #4. Qualified PKI signatures, official visual PDF fixture SSIM/heatmap validation, production file storage/backup/restore drill and full multi-role approval integration tests are not implied by a passing build or health check.

## Auto-deploy Worker (GitHub Actions)

Workflow `.github/workflows/build-cloudflare-worker.yml` tests and builds React+Hono on PRs and `main`, then deploys the compiled artifact to the existing `qamanager` Worker **only on a push to `main`**. Required GitHub repository secrets: `CLOUDFLARE_API_TOKEN` (least-privilege Cloudflare Worker edit/read) and `CLOUDFLARE_ACCOUNT_ID`. Neither value belongs in the source tree.

The deploy script checks the current Worker settings before upload, preserves `HYPERDRIVE`, `BROWSER`, `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`, checks the bindings afterward, and confirms `/projects` serves HTML without download while `/api/status` returns JSON/ready. On failed preflight, the deployment is **not started**. A failed post-upload smoke test now fails the workflow **and attempts to restore the previous Worker version's traffic allocation** via the Cloudflare Deployments API. This rollback is covered by an isolated regression test. Database migrations and external side effects are **not** rolled back automatically.

**Critical migration gate:** Any SQL migration required by an application release must be applied and independently verified **before the PR is merged to `main`**. In particular, `db/migrations/20261121_master_audit_workflow.sql` is required by the current application; otherwise deployments can pass build and break at runtime. Protect `main` with required PR checks/review. Build checks alone are not production UAT.
