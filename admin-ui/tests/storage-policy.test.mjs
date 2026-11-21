import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRIVATE_STORAGE_LIMITS as limits, wouldExceedQuota, storageMiB } from '../functions/api/storage-policy.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const workflow = source('../functions/api/workflow-routes.js');
const pdf = source('../functions/api/pdf-support.js');
const ops = source('../src/pages/ProjectOpsPage.tsx');
const openapi = source('../../api-docs/openapi.yaml');

test('physical bytea limits are explicit and finite', () => {
  assert.equal(limits.evidenceFile,4*1024*1024);
  assert.equal(limits.evidenceItemCount,10);
  assert.equal(limits.evidenceSessionBytes,64*1024*1024);
  assert.equal(limits.evidenceProjectBytes,256*1024*1024);
  assert.equal(limits.fixtureTemplateCount,10);
  assert.equal(limits.fixtureProjectBytes,100*1024*1024);
  assert.equal(limits.pdfSessionCount,20);
  assert.equal(limits.pdfProjectBytes,256*1024*1024);
  assert.match(storageMiB(1024*1024),/1\.0 MiB/);
});

test('quota accounting allows exactly remaining budget, rejects overflow', () => {
  assert.equal(wouldExceedQuota(0,10,10),false);
  assert.equal(wouldExceedQuota(9,1,10),false);
  assert.equal(wouldExceedQuota(10,0,10),false);
  assert.equal(wouldExceedQuota(10,1,10),true);
  assert.equal(wouldExceedQuota(11,0,10),true);
  assert.equal(wouldExceedQuota(0,0,10),false);
  assert.equal(wouldExceedQuota(Number.MAX_SAFE_INTEGER,1,Number.MAX_SAFE_INTEGER),true);
  for (const values of [[-1,1,10],[1,-1,10],[1,1,0],[1,1,Infinity],[NaN,1,10],[1,1,Number.MAX_SAFE_INTEGER+1]]) {
    assert.throws(() => wouldExceedQuota(...values),/Invalid private storage quota/);
  }
});

test('project usage endpoint requires admin/auditor and counts tombstone evidence bytes', () => {
  const start = workflow.indexOf("app.get('/api/projects/:projectId/storage-usage'");
  const end = workflow.indexOf("app.get('/api/dashboard/portfolio'",start);
  assert.ok(start>=0&&end>start);
  const route=workflow.slice(start,end);
  assert.match(route,/guard\(c,'projectId',\['ADMIN','AUDITOR'\]\)/);
  assert.match(route,/FROM ulo_evidence WHERE project_id=\$1/);
  assert.doesNotMatch(route,/FROM ulo_evidence WHERE project_id=\$1 AND deleted_at IS NULL/);
  assert.match(route,/AS total_bytes/);
  assert.match(route,/fixtureProjectBytes/);
  assert.match(route,/pdfProjectBytes/);
});

test('evidence upload protects session/item quota and global project quota in one transaction', () => {
  const start=workflow.indexOf("app.post('/api/sesi/:sesiId/items/:itemId/evidence'");
  const end=workflow.indexOf("app.get('/api/sesi/:sesiId/items/:itemId/evidence/:evidenceId/download'",start);
  assert.ok(start>=0&&end>start);
  const route=workflow.slice(start,end);
  const atomic=route.indexOf('return atomic(c,async()=>');
  const projectLock=route.indexOf('SELECT id FROM projects WHERE id=$1 FOR UPDATE');
  const sessionLock=route.indexOf('SELECT status FROM ulo_sesi WHERE id=$1 FOR UPDATE');
  const itemLock=route.indexOf('SELECT id FROM ulo_item WHERE sesi_id=$1 AND id=$2 FOR UPDATE');
  const itemLimit=route.indexOf('evidenceItemCount');
  const projectLimit=route.indexOf('evidenceProjectBytes');
  const sessionLimit=route.indexOf('evidenceSessionBytes');
  const audit=route.indexOf("audit(c,'EVIDENCE_UPLOADED'");
  assert.ok(atomic>=0 && atomic<projectLock && projectLock<sessionLock && sessionLock<itemLock);
  assert.ok(itemLock<itemLimit && itemLimit<projectLimit && projectLimit<sessionLimit && sessionLimit<audit);
  assert.match(route,/FROM ulo_evidence WHERE project_id=\$1/);
});

test('PDF and fixture uploads lock same project row and budget physical bytes', () => {
  const fixture = pdf.slice(pdf.indexOf("app.post('/api/templates/:templateId/fixtures'"),pdf.indexOf("app.get('/api/templates/:templateId/fixtures/:fixtureId/download'"));
  const generate= pdf.slice(pdf.indexOf("app.post('/api/sesi/:sesiId/pdf'"),pdf.indexOf("app.get('/api/sesi/:sesiId/outputs/:outputId/download'"));
  for (const route of [fixture,generate]) {
    assert.match(route,/SELECT id FROM projects WHERE id=\$1 FOR UPDATE/);
    assert.match(route,/wouldExceedQuota\(/);
    assert.match(route,/AS total_bytes/);
  }
  assert.match(fixture,/fixtureTemplateCount/);
  assert.match(generate,/pdfProjectBytes/);
  assert.match(generate,/qamanager_pdf_metrics/);
  assert.match(generate,/total_ms:Date.now\(\)-startedAt/);
  assert.match(generate,/render_ms: renderMs/);
});

test('UI and OpenAPI expose a read-only admin/auditor storage overview', () => {
  assert.match(ops,/storage-usage/);
  assert.match(ops,/Kapasitas penyimpanan/);
  assert.match(openapi,/\/projects\/\{projectId\}\/storage-usage:/);
});
