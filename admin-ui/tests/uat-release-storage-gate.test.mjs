import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync(new URL('../../.github/workflows/production-uat-release-smoke.yml',import.meta.url),'utf8');

test('UAT release gate rejects inactive or fallback storage in a configured deployment',()=>{
  assert.match(workflow,/pdf_storage == "supabase_private_storage"/);
  assert.doesNotMatch(workflow,/pdf_storage == "supabase_private_bytea"/);
  assert.match(workflow,/\.pdf == "browser-run"/);
  assert.match(workflow,/\.database == "connected"/);
});

test('UAT smoke runs after actual main deployment and daily, not only when manually dispatched',()=>{
  assert.match(workflow,/workflows: \['Build Cloudflare Hono Worker'\]/);
  assert.match(workflow,/types: \[completed\]/);
  assert.match(workflow,/head_branch == 'main'/);
  assert.match(workflow,/workflow_run\.event == 'push'/);
  assert.match(workflow,/schedule:/);
});

test('UAT gate includes negative access checks on private object downloads and portfolio',()=>{
  for(const path of [
    '/api/sesi/1/items/1/evidence/1/download',
    '/api/sesi/1/outputs/1/download',
    '/api/templates/1/fixtures/1/download',
    '/api/projects/1/storage-usage',
    '/api/dashboard/portfolio',
  ]) assert.ok(workflow.includes('check GET '+path+' 401'),'Missing anonymous guard: '+path);
});
