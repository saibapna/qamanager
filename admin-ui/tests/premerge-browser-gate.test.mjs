import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const workflow=source('../../.github/workflows/production-browser-smoke.yml');
const config=source('../../.github/playwright.production.config.mjs');
const tests=source('../../.github/tests/production-browser.spec.mjs');

test('pull requests run Playwright on their actual source build, not deployed main',()=>{
  assert.match(workflow,/pull_request:/);
  assert.match(workflow,/Build frontend from PR/);
  assert.match(workflow,/npm run build/);
  assert.match(workflow,/npx vite preview/);
  assert.match(workflow,/QA_BROWSER_BASE_URL:/);
  assert.match(workflow,/http:\/\/127\.0\.0\.1:4173/);
  assert.match(config,/process\.env\.QA_BROWSER_BASE_URL/);
});
test('production probes remain triggered after successful Worker deployment',()=>{
  assert.match(workflow,/workflow_run:/);
  assert.match(workflow,/workflows: \["Build Cloudflare Hono Worker"\]/);
  assert.match(workflow,/github.event.workflow_run.conclusion == 'success'/);
});
test('mock-only role and module coverage cannot silently disappear',()=>{
  assert.match(tests,/installSyntheticAuthenticatedUi/);
  for(const screen of ['project operations','project detail','PDF validation','authorized portfolio']){
    assert.match(tests,new RegExp(screen));
  }
  assert.match(tests,/for\(const tab of \['Dashboard','Anggota & Role','Penguji & Saksi','Test Plan','Audit Trail'\]/);
  assert.match(tests,/await assertWcag21Aa\(page/);
});
