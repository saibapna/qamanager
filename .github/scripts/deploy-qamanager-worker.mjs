import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const workerName = 'qamanager';
const hostname = 'https://qamanager.saipulbahri-it.workers.dev';
const expected = new Map([
  ['BROWSER', 'browser'],
  ['HYPERDRIVE', 'hyperdrive'],
  ['JWT_ACCESS_SECRET', 'secret_text'],
  ['JWT_REFRESH_SECRET', 'secret_text'],
]);

if (!/^[0-9a-f]{32}$/i.test(accountId || '') || !apiToken) {
  throw new Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN as GitHub Actions secrets.');
}

const apiBase = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`;
const auth = { Authorization: `Bearer ${apiToken}` };

async function cloudflare(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...auth, ...options.headers } });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    const errors = data?.errors?.map(e => `${e.code}: ${e.message}`).join('; ');
    throw new Error(`Cloudflare API HTTP ${response.status}: ${errors || 'request failed'}`);
  }
  return data.result;
}

function assertBindings(settings, phase) {
  const bindings = settings?.bindings;
  assert.ok(Array.isArray(bindings), `${phase}: cannot verify Worker bindings`);
  const actual = new Map(bindings.map(b => [b.name, b.type]));
  assert.equal(actual.size, expected.size, `${phase}: unexpected binding set; update deployment safeguards first`);
  for (const [name, type] of expected) {
    assert.equal(actual.get(name), type, `${phase}: missing or changed binding ${name}`);
  }
  const hyperdrive = bindings.find(b => b.name === 'HYPERDRIVE');
  assert.ok(hyperdrive?.id, `${phase}: Hyperdrive ID unavailable`);
  return hyperdrive.id;
}

const before = await cloudflare(`${apiBase}/settings`);
const hyperdriveId = assertBindings(before, 'preflight');
assert.equal(before.compatibility_date, '2026-11-20', 'compatibility date changed; review before auto-deploy');
assert.ok(before.compatibility_flags?.includes('nodejs_compat'), 'nodejs_compat missing');

const code = await readFile(new URL('../../admin-ui/worker-dist/qamanager-worker.mjs', import.meta.url));
const metadata = {
  main_module: 'qamanager-worker.mjs',
  keep_bindings: ['browser', 'hyperdrive', 'secret_text'],
  compatibility_date: before.compatibility_date,
  compatibility_flags: before.compatibility_flags,
  observability: before.observability,
};
const form = new FormData();
form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
form.append('qamanager-worker.mjs', new Blob([code], { type: 'application/javascript+module' }), 'qamanager-worker.mjs');

console.log(`Deploying ${workerName}; preserving ${expected.size} existing bindings`);
await cloudflare(apiBase, { method: 'PUT', body: form });

const after = await cloudflare(`${apiBase}/settings`);
assert.equal(assertBindings(after, 'post-deploy'), hyperdriveId, 'Hyperdrive binding changed');

async function smoke(path, expectedType) {
  const response = await fetch(hostname + path, { headers: { 'Cache-Control': 'no-cache' } });
  assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`);
  assert.match(response.headers.get('content-type') || '', expectedType, `${path} returned wrong Content-Type`);
  assert.equal(response.headers.get('content-disposition'), null, `${path} unexpectedly downloads`);
  return response;
}

const page = await smoke('/projects', /^text\/html\b/i);
assert.match(await page.text(), /<html\b/i, '/projects did not return an HTML document');
const status = await smoke('/api/status', /^application\/json\b/i);
const result = await status.json();
assert.equal(result.service, workerName, 'Wrong Worker answered the status check');
assert.equal(result.ready, true, 'API reports missing bindings');
console.log('Deploy PASS: /projects is HTML; /api/status ready; bindings preserved.');
