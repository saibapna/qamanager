import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const workerName = 'qamanager';
const configuredR2Bucket = (process.env.QAMANAGER_R2_BUCKET || '').trim();
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

if (configuredR2Bucket && !/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(configuredR2Bucket)) {
  throw new Error('QAMANAGER_R2_BUCKET must be a valid Cloudflare R2 bucket name (3-64 lowercase characters).');
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

function assertBindings(settings, phase, requireRealtime = false, requireR2 = false, requireStorageSecret = false) {
  const bindings = settings?.bindings;
  assert.ok(Array.isArray(bindings), `${phase}: cannot verify Worker bindings`);
  const actual = new Map(bindings.map(b => [b.name, b.type]));
  const required = new Map(expected);
  if (requireRealtime) required.set('PROJECT_LIVE', 'durable_object_namespace');
  if (requireR2) required.set('R2_FILES', 'r2_bucket');
  if (requireStorageSecret) required.set('SUPABASE_STORAGE_SERVICE_ROLE_KEY', 'secret_text');
  assert.equal(actual.size, required.size, `${phase}: unexpected binding set; update deployment safeguards first`);
  for (const [name, type] of required) {
    assert.equal(actual.get(name), type, `${phase}: missing or changed binding ${name}`);
  }
  const hyperdrive = bindings.find(b => b.name === 'HYPERDRIVE');
  assert.ok(hyperdrive?.id, `${phase}: Hyperdrive ID unavailable`);
  const r2 = bindings.find(b => b.name === 'R2_FILES');
  if (requireR2) assert.ok(r2?.bucket_name, `${phase}: R2 bucket name unavailable`);
  return { hyperdriveId: hyperdrive.id, r2Bucket: r2?.bucket_name || null };
}

const previous = await cloudflare(`${apiBase}/deployments`);
const previousVersions = previous?.deployments?.[0]?.versions;
assert.ok(Array.isArray(previousVersions) && previousVersions.length > 0,
  'No previously healthy deployment to roll back to');
assert.equal(previousVersions.reduce((sum, version) => sum + version.percentage, 0), 100,
  'Previous deployment traffic percentages are invalid');

const before = await cloudflare(`${apiBase}/settings`);
const existingRealtime = before.bindings?.some(b => b.name === 'PROJECT_LIVE');
const existingR2 = before.bindings?.find(b => b.name === 'R2_FILES');
const existingStorageSecret = before.bindings?.some(b => b.name === 'SUPABASE_STORAGE_SERVICE_ROLE_KEY');
if (existingR2 && existingR2.type !== 'r2_bucket') {
  throw new Error('R2_FILES already exists but is not an R2 binding');
}
if (configuredR2Bucket && existingR2 && existingR2.bucket_name !== configuredR2Bucket) {
  throw new Error('R2_FILES bucket mismatch; refusing to rebind an existing production resource');
}
const expectedR2Bucket = configuredR2Bucket || existingR2?.bucket_name || null;
const { hyperdriveId } = assertBindings(before, 'preflight', existingRealtime, Boolean(existingR2), existingStorageSecret);
assert.equal(before.compatibility_date, '2026-11-20', 'compatibility date changed; review before auto-deploy');
assert.ok(before.compatibility_flags?.includes('nodejs_compat'), 'nodejs_compat missing');

const code = await readFile(new URL('../../admin-ui/worker-dist/qamanager-worker.mjs', import.meta.url));
const addedBindings = [
  ...(!existingRealtime ? [{ name: 'PROJECT_LIVE', type: 'durable_object_namespace', class_name: 'ProjectLive' }] : []),
  ...(configuredR2Bucket && !existingR2 ? [{ name: 'R2_FILES', type: 'r2_bucket', bucket_name: configuredR2Bucket }] : []),
];
const metadata = {
  main_module: 'qamanager-worker.mjs',
  keep_bindings: ['browser', 'hyperdrive', 'secret_text',
    ...(existingRealtime ? ['durable_object_namespace'] : []),
    ...(existingR2 ? ['r2_bucket'] : [])],
  ...(addedBindings.length ? { bindings: addedBindings } : {}),
  ...(!existingRealtime ? { migrations: { new_tag: 'qamanager-realtime-v1', new_sqlite_classes: ['ProjectLive'] } } : {}),
  compatibility_date: before.compatibility_date,
  compatibility_flags: before.compatibility_flags,
  observability: before.observability,
};
const form = new FormData();
form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
form.append('qamanager-worker.mjs', new Blob([code], { type: 'application/javascript+module' }), 'qamanager-worker.mjs');

console.log(`Deploying ${workerName}; preserving ${expected.size} protected bindings and enabling PROJECT_LIVE`);
let uploadSucceeded = false;
try {
  await cloudflare(apiBase, { method: 'PUT', body: form });
  uploadSucceeded = true;

  const after = await cloudflare(`${apiBase}/settings`);
  const verified = assertBindings(after, 'post-deploy', true, Boolean(expectedR2Bucket), existingStorageSecret);
  assert.equal(verified.hyperdriveId, hyperdriveId, 'Hyperdrive binding changed');
  if (expectedR2Bucket) assert.equal(verified.r2Bucket, expectedR2Bucket, 'R2 bucket binding changed');

  async function smoke(path, expectedType) {
    const response = await fetch(hostname + path, { headers: { 'Cache-Control': 'no-cache' } });
    assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`);
    assert.match(response.headers.get('content-type') || '', expectedType, `${path} returned wrong Content-Type`);
    assert.equal(response.headers.get('content-disposition'), null, `${path} unexpectedly downloads`);
    return response;
  }

  const page = await smoke('/projects', new RegExp('^text/html', 'i'));
  assert.ok((await page.text()).toLowerCase().includes('<html'), '/projects did not return an HTML document');
  const status = await smoke('/api/status', new RegExp('^application/json', 'i'));
  const result = await status.json();
  assert.equal(result.service, workerName, 'Wrong Worker answered the status check');
  assert.equal(result.ready, true, 'API reports missing bindings');

  const health = await smoke('/api/health', new RegExp('^application/json', 'i'));
  const healthData = await health.json();
  assert.equal(healthData.ok, true, 'Database health check failed');
  assert.equal(healthData.database, 'connected', 'Hyperdrive is not connected');
  console.log('Deploy PASS: /projects is HTML; /api/status ready; /api/health database connected; bindings preserved.' +
    (expectedR2Bucket ? ' R2_FILES=' + expectedR2Bucket + ' (storage migration NOT active).' : ''));
} catch (error) {
  console.error('Deploy verification failed:', error instanceof Error ? error.message : String(error));
  if (uploadSucceeded) {
    // A new Worker version was activated but did not pass the production smoke gate.
    // Restore the previous traffic allocation while keeping the old version intact.
    try {
      await cloudflare(`${apiBase}/deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: 'percentage',
          versions: previousVersions,
          annotations: { 'workers/message': 'Automatic rollback after failed QA Manager deploy verification' },
        }),
      });
      console.error('ROLLBACK SUCCESS: restored previous Worker version traffic percentages');
    } catch (rollbackError) {
      console.error('ROLLBACK FAILURE — manual intervention is required:',
        rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
    }
  }
  throw error;
}
