# ULO/UAT Manager — Cloudflare staging deployment

Live staging: https://qamanager.saipulbahri-it.workers.dev

- worker/index.ts routes /api/* to functions/api/[[path]].js and serves the React SPA.
- functions/api/workflow-routes.js handles RBAC, plan catalog, membership, defects, retest, evidence, internal approvals, audit and dashboard.
- functions/api/pdf-support.js renders PDF using Cloudflare Browser Run and privately stores PDF bytes in Supabase PostgreSQL.
- Supabase project kyzrhgfynbtlmzfwvdyg uses private schema ulo_uat.
- Hyperdrive qamanager-supabase is bound as HYPERDRIVE; Browser Run is bound as BROWSER.
- JWT signing secrets stay server-only. Never publish credentials.

## Scope and limitations

**Staging — not certified production.** SIRIKAP and SIMPEG have 71 canonical test cases each. New UAT sessions copy the full plan. Changing a case writes append-only events; FAIL creates a defect. Retest or recorded waiver is required before finalization. Two different accounts acting as WITNESS and APPROVER complete an internal approval workflow.

The SIGNED state represents an **internal approval attestation**, not a legally qualified digital signature. A real PKI provider, certificate validation and organization sign-off are still outstanding in issue #4.

PDF output via Browser Run is limited to 6 MiB per file, 20 versions per session. Fixture upload is limited to 5 MiB. Both are stored as private PostgreSQL bytea values while R2 is not enabled. PDF validation currently uses **SHA-256 exact bytes**, not SSIM or pixel-level fidelity. The official baseline fixture is not part of the repo. Do not claim 1:1 visual compliance.

## Build and deploy

Build with Node.js 22:

    cd admin-ui
    npm install --no-audit --no-fund
    npm run build
    npm run build:worker

GitHub Actions workflow build-cloudflare-worker.yml produces the qamanager-hono-worker artifact. **A successful build is not a deployment.** A deployment needs HYPERDRIVE, BROWSER, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET bindings; compatibility flag nodejs_compat; and tested status, health and auth endpoints.

## Database migrations

Do not rerun initial bootstrap against an existing staging database. Apply reviewed additive migrations, especially db/migrations/20261121_master_audit_workflow.sql. It adds platform-admin permissions, project test plan catalog, defect lifecycle, retests, evidence, approvals, audit immutability, auth throttling, and missing FK indexes without rewriting existing sessions.

## Authentication

Cloudflare Worker password hashes use PBKDF2-SHA256 with exactly 100,000 iterations due the deployed Workers runtime limit. The old Express backend uses Argon2 and is **not compatible** with Worker account provisioning. Cloudflare sets HttpOnly/Secure/SameSite=Strict cookies; client-side JWT persistence is not allowed. Logout revokes refresh tokens.

## Verification / Definition of Done

Follow https://github.com/saibapna/qamanager/issues/4. Completion requires passing unit tests, TypeScript build, production login/logout/refresh, cross-tenant access checks, 71-item session creation, finalization negative tests, evidence/defect/retest/approval workflow, and PDF/fixture binary roundtrip. Actual official pixel fidelity and qualified signatures require external baseline/provider proof.

Do not mark an item complete only because an API route exists.
