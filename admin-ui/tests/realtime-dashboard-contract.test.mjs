import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const hono = source('../functions/api/[[path]].js');
const workflow = source('../functions/api/workflow-routes.js');
const liveClient = source('../src/api/live.ts');
const ops = source('../src/pages/ProjectOpsPage.tsx');
const detail = source('../src/pages/ProjectDetailPage.tsx');
const realtimeHook = source('../src/lib/useProjectLive.ts');

test('admin dashboard and realtime session progress have distinct response contracts', () => {
  assert.equal((workflow.match(/app\.get\('\/api\/projects\/:projectId\/dashboard'/g) || []).length, 1);
  assert.equal((hono.match(/app\.get\('\/api\/projects\/:projectId\/dashboard'/g) || []).length, 0);
  assert.equal((hono.match(/app\.get\('\/api\/projects\/:projectId\/live-dashboard'/g) || []).length, 1);
  assert.match(liveClient, /\/projects\/\$\{projectId\}\/live-dashboard/);
  assert.match(ops, /['"]\/projects\/['"]\+pid\+['"]\/dashboard['"]/);
});

test('project details renders its realtime panel rather than only importing it', () => {
  assert.match(detail, /<ProjectLivePanel projectId=\{pid\}\s*\/>/);
});

test('realtime changes invalidate both administrative and session progress summaries', () => {
  assert.match(realtimeHook, /queryKey: \['project-dashboard', projectId\]/);
  assert.match(realtimeHook, /queryKey: \['dashboard', projectId\]/);
});
