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

The GitHub build workflow publishes a Worker artifact but does NOT automatically deploy. Deploy with all runtime bindings preserved. Verify authenticated workflows on the public staging URL after deployment.

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

## Release blockers
See GitHub issue #4. Qualified PKI signatures, official visual PDF fixture SSIM/heatmap validation, production file storage/backup/restore drill and CI/CD verification are not implied by a passing build or health check.
