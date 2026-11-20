import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const workflow = source('../functions/api/workflow-routes.js');
const projectsApi = source('../src/api/projects.ts');
const projectsPage = source('../src/pages/ProjectsPage.tsx');
const ops = source('../src/pages/ProjectOpsPage.tsx');
const table = source('../src/components/TestPlanTable.tsx');
const openapi = source('../../api-docs/openapi.yaml');

test('portfolio SQL must scope membership in the database query', () => {
  const start = workflow.indexOf("app.get('/api/dashboard/portfolio'");
  const end = workflow.indexOf("app.get('/api/projects/:projectId/plan'", start);
  assert.ok(start >= 0 && end > start);
  const route = workflow.slice(start, end);
  assert.match(route, /JOIN project_members pm ON pm.project_id=p.id/);
  assert.match(route, /WHERE pm.user_id=\$1 AND p.aktif=TRUE/);
  assert.match(route, /\[c.get\('uid'\)\]/);
  assert.match(route, /count\(\*\) FILTER \(WHERE i.status='PASS'\)/);
  assert.match(route, /CROSS JOIN LATERAL/);
  assert.doesNotMatch(route, /SELECT p\.\* FROM projects/);
});

test('portfolio client and UI use only authorized endpoint', () => {
  assert.match(projectsApi, /'\/dashboard\/portfolio'/);
  assert.match(projectsPage, /queryFn: projectsApi.portfolio/);
  assert.match(projectsPage, /Ringkasan semua project yang dapat Anda akses/);
  assert.match(openapi, /\/dashboard\/portfolio:/);
});

test('test plan keeps the immutable-after-first-session server gate and UI gate', () => {
  assert.match(workflow, /SELECT id FROM ulo_sesi WHERE project_id=\$1 LIMIT 1 FOR UPDATE/);
  assert.match(workflow, /Tidak boleh mengubah test plan setelah ada sesi/);
  assert.match(ops, /editable=\{admin&&dashboard\?\.sessions\.total===0\}/);
  assert.match(table, /new Set\(normalized.map\(row => row.no\)\)/);
  assert.match(table, /Filter kategori test plan/);
  assert.match(table, /Halaman test plan/);
  assert.match(table, /async function submit/);
});
