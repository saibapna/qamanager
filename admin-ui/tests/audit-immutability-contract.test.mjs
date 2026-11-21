import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = src('../../db/migrations/20261121_master_audit_workflow.sql');
const api = src('../functions/api/[[path]].js');
const workflow = src('../functions/api/workflow-routes.js');
const smoke = src('../../.github/workflows/production-api-smoke.yml');

test('DB append-only audit and item event trigger definitions cannot be omitted', () => {
  assert.match(migration,/CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON ulo_uat\.audit_events/);
  assert.match(migration,/CREATE TRIGGER ulo_item_events_immutable BEFORE UPDATE OR DELETE ON ulo_uat\.ulo_item_events/);
  assert.match(migration,/RAISE EXCEPTION 'Append-only audit record may not be modified'/);
  assert.match(migration,/FOR EACH ROW EXECUTE FUNCTION ulo_uat\.forbid_audit_mutation/);
});

test('public Hono route registry exposes read-only audit and UAT history', () => {
  assert.match(workflow,/app\.get\('\/api\/projects\/:projectId\/audit'/);
  assert.match(workflow,/guard\(c,'projectId',\['ADMIN','AUDITOR'\]\)/);
  assert.match(workflow,/app\.get\('\/api\/sesi\/:sesiId\/history'/);
  for (const source of [api, workflow]) {
    assert.doesNotMatch(source, /app\.(post|put|patch|delete)\('\/api\/projects\/:projectId\/audit'/);
    assert.doesNotMatch(source, /app\.(post|put|patch|delete)\('\/api\/sesi\/:sesiId\/history'/);
  }
});

test('mutation and audit write are committed together; anonymous audit endpoint is probed in production', () => {
  const helper=src('../functions/api/workflow-core.js');
  assert.match(helper,/export async function runAtomic/);
  assert.match(helper,/await query\('BEGIN'\)/);
  assert.match(helper,/await query\('COMMIT'\)/);
  assert.match(helper,/await query\('ROLLBACK'\)/);
  assert.match(smoke,/for method in GET POST PATCH DELETE/);
  assert.match(smoke,/\/api\/projects\/1\/audit/);
  assert.match(smoke,/test "\$code" = "401"/);
});
