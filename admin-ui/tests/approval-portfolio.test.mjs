import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const workflow = source('../functions/api/workflow-routes.js');
const projects = source('../src/pages/ProjectsPage.tsx');
const operations = source('../src/pages/ProjectOpsPage.tsx');
const client = source('../src/api/projects.ts');
const openapi = source('../../api-docs/openapi.yaml');

test('portfolio approval status is tenant scoped and tied to current UAT revision', () => {
  const start=workflow.indexOf("app.get('/api/dashboard/portfolio'");
  const end=workflow.indexOf("app.get('/api/projects/:projectId/plan'",start);
  assert.ok(start>=0&&end>start);
  const route=workflow.slice(start,end);
  assert.match(route,/JOIN project_members pm ON pm.project_id=p.id/);
  assert.match(route,/WHERE pm.user_id=\$1 AND p.aktif=TRUE/);
  assert.match(route,/a.sesi_id=s.id AND a.revision=s.revision/);
  assert.match(route,/a.role='WITNESS' AND a.decision='APPROVED'/);
  assert.match(route,/a.role='APPROVER'/);
  assert.match(route,/s.finalized_at IS NOT NULL/);
  assert.match(route,/AS awaiting_witness/);
  assert.match(route,/AS awaiting_approver/);
  assert.match(route,/AS rejected_decisions/);
});

test('project dashboard uses same current-revision pipeline and keeps existing response fields', () => {
  const start=workflow.indexOf("app.get('/api/projects/:projectId/dashboard'");
  const end=workflow.indexOf("app.get('/api/projects/:projectId/audit'",start);
  const route=workflow.slice(start,end);
  assert.match(route,/guard\(c,'projectId'\)/);
  assert.match(route,/WHERE s.project_id=\$1/);
  assert.match(route,/s.revision=a.revision|a.revision=s.revision/);
  assert.match(route,/return c.json\(\{sessions,items,defects,approvals\}\)/);
});

test('both project dashboards display pending witness/approver and historical rejections', () => {
  assert.match(client,/awaiting_witness: number; awaiting_approver: number; rejected_decisions: number/);
  assert.match(projects,/Menunggu saksi/);
  assert.match(projects,/Menunggu approver/);
  assert.match(projects,/Riwayat penolakan/);
  assert.match(operations,/Menunggu Saksi/);
  assert.match(operations,/Menunggu Approver/);
  assert.match(openapi,/awaiting_witness:/);
  assert.match(openapi,/awaiting_approver:/);
});
