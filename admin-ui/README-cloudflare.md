# Cloudflare deployment - Hono + React

The `worker/index.ts` Worker serves the Vite-built React SPA and routes `/api/*` to the Hono application in `functions/api/[[path]].js`. Its Vite assets are embedded into the compiled Worker by `scripts/inline-worker-assets.mjs`. The `build:worker` command requires a successful frontend `npm run build` first. This is a deployment bridge while Cloudflare GitHub/Pages integration is unavailable; use Workers Static Assets for a larger production frontend.

Build on a Node.js 22 machine with npm registry access:

```bash
cd admin-ui
npm install
npm run build
npm run build:worker
```

The GitHub Actions workflow `build-cloudflare-worker.yml` builds and uploads the Worker bundle as an artifact. Deploy it with Cloudflare Workers, Node.js compatibility (`nodejs_compat`, compatibility date `2026-11-20`), and **server-only bindings** `HYPERDRIVE`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET`. The Hyperdrive config must point to a database login whose access is restricted to the private `ulo_uat` schema. Never put database credentials or signing keys in source or Vite `VITE_*` variables.

The database schema currently has no interactive admin account. Provision users securely server-side. The Hono API supports core ULO operations but its Cloudflare runtime has **not** passed end-to-end test. The old Express/Puppeteer/Python PDF service is intentionally not deployed; PDF, fixture, and diff routes return 501.

Important: browser code and all Worker routes must use HTTPS. Before claiming production readiness: install a first admin account, smoke-test login/refresh, verify per-project authorization, test transactions, and configure Cloudflare rate limits, observability, and monitoring. The staging code does not promise 1:1 PDF fidelity.
