import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const layout=source('../src/components/Layout.tsx');
const sidebar=source('../src/components/Sidebar.tsx');
const live=source('../src/components/ProjectLivePanel.tsx');
const browserWorkflow=source('../../.github/workflows/production-browser-smoke.yml');
const browserTests=source('../../.github/tests/production-browser.spec.mjs');

test('signed-in UI has an accessible skip link to a focusable main landmark',()=>{
  assert.match(layout,/href="#qa-main-content"/);
  assert.match(layout,/Lewati navigasi menuju konten utama/);
  assert.match(layout,/focus:not-sr-only/);
  assert.match(layout,/<main id="qa-main-content" tabIndex=\{-1\}/);
});

test('sidebar nav has distinct mobile/desktop labels and keyboard focus visible',()=>{
  assert.match(sidebar,/aria-label="Navigasi utama"/);
  assert.match(sidebar,/aria-label="Navigasi utama desktop"/);
  assert.match(sidebar,/focus-visible:outline/);
});

test('realtime progress tiles reflow to two columns on mobile',()=>{
  assert.match(live,/grid-cols-2 sm:grid-cols-4/);
  assert.match(live,/role="status" aria-live="polite"/);
});

test('browser smoke runs after Worker deploy success and daily; auth mock is explicitly synthetic',()=>{
  assert.match(browserWorkflow,/workflow_run:/);
  assert.match(browserWorkflow,/workflows: \["Build Cloudflare Hono Worker"\]/);
  assert.match(browserWorkflow,/github.event.workflow_run.conclusion == 'success'/);
  assert.match(browserWorkflow,/cron: '0 2 \* \* \*'/);
  assert.match(browserTests,/keyboard alone/);
  assert.match(browserTests,/mocked signed-in layout/);
  assert.match(browserTests,/synthetic@example.invalid/);
});
