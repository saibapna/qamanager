# QA Manager Real-time Collaboration

Cloudflare Worker + Hono + Durable Object ProjectLive. Each project has a distinct WebSocket room. PostgreSQL remains the source of truth, and all writes continue to use existing canonical UAT validation, defect/retest and audit workflows.

## Security

- WebSocket connection is same-origin only and uses the existing HttpOnly qa_access cookie.
- The established Hono authentication middleware verifies an active, unrevoked session; project authorization is checked against project_members before the socket is accepted.
- No bearer token, refresh token, service-role key or database password is sent as a URL query parameter or WebSocket protocol.
- Each connection is bounded by the expiration time of its access token. Durable Object drops expired connections when broadcasting.
- Client-originated WebSocket messages do not write database state or trigger broadcasts.
- All writes remain authorized in the API and guarded by a monotonically increasing ulo_sesi.revision. Stale saves return 409 and keep local drafts unsaved.

## Deployment

1. Apply db/migrations/20261121_realtime_collaboration.sql (idempotent).
2. Build `cd admin-ui && npm install && npm run build && npm run build:worker`.
3. The GitHub Actions deployment script uploads the ProjectLive Durable Object migration and binding if not previously installed, and preserves all existing Cloudflare secrets and Hyperdrive.
4. Verify /api/status, /api/health, and deep-link refresh.
5. Sign in with two distinct project members and verify WebSocket presence, dashboard updates, revision conflicts, reconnection and logout.
6. If WebSockets are temporarily unavailable, project dashboard and session pages poll every 15 seconds; this is a degraded near-real-time mode, not push.

## Compatibility

There is no Supabase Realtime direct connection from the browser. Private ulo_uat tables remain inaccessible through Supabase Data API. Existing main-branch cookie authentication and UAT workflow are preserved.
