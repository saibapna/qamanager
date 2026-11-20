/**
 * Read-only health endpoint for the private ULO/UAT PostgreSQL schema.
 * Auth is enforced by Supabase JWT verification (verify_jwt: true).
 * This never exposes user identities, individual UAT results, or SQL execution.
 */
import postgres from 'npm:postgres@3.4.7';

const databaseUrl = Deno.env.get('SUPABASE_DB_URL');
const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!databaseUrl) return json({ status: 'unavailable', database: 'unconfigured' }, 503);
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 5,
  });
  try {
    const [counts] = await sql<{
      projects: number; templates: number; sessions: number; items: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM ulo_uat.projects) AS projects,
        (SELECT count(*)::int FROM ulo_uat.templates) AS templates,
        (SELECT count(*)::int FROM ulo_uat.ulo_sesi) AS sessions,
        (SELECT count(*)::int FROM ulo_uat.ulo_item) AS items
    `;
    return json({ status: 'ok', database: 'connected', counts });
  } catch (error) {
    console.error('qamanager-status: DB connection failed', error instanceof Error ? error.message : 'unknown');
    return json({ status: 'unavailable', database: 'unavailable' }, 503);
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
});
