import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runAtomic } from '../functions/api/workflow-core.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('successful mutation commits its audit insert in the same transaction', async () => {
  const calls = [];
  const result = await runAtomic(async sql => { calls.push(sql); }, async () => {
    calls.push('UPDATE business data');
    calls.push('INSERT audit_events');
    return 7;
  });
  assert.equal(result, 7);
  assert.deepEqual(calls, ['BEGIN','UPDATE business data','INSERT audit_events','COMMIT']);
});

test('failure to insert immutable audit rolls back preceding data mutation', async () => {
  const calls = [];
  const error = new Error('audit table temporarily unavailable');
  await assert.rejects(runAtomic(async sql => { calls.push(sql); }, async () => {
    calls.push('UPDATE business data');
    throw error;
  }), e => e === error);
  assert.deepEqual(calls, ['BEGIN','UPDATE business data','ROLLBACK']);
});

test('COMMIT failure attempts ROLLBACK and retains cause', async () => {
  const calls = [];
  await assert.rejects(runAtomic(async sql => {
    calls.push(sql);
    if (sql === 'COMMIT') throw new Error('commit failed');
  }, async () => 'ok'), /commit failed/);
  assert.deepEqual(calls, ['BEGIN','COMMIT','ROLLBACK']);
});

test('failure to ROLLBACK does not mask the original audit failure', async () => {
  const calls = [];
  const original = new Error('audit missing');
  await assert.rejects(runAtomic(async sql => {
    calls.push(sql);
    if (sql === 'ROLLBACK') throw new Error('database unavailable');
  }, async () => { throw original; }), e => e === original);
  assert.deepEqual(calls, ['BEGIN','ROLLBACK']);
});

test('production evidence mutation guards finalization and quota under same transaction', () => {
  const workflow = source('../functions/api/workflow-routes.js');
  const start = workflow.indexOf("app.post('/api/sesi/:sesiId/items/:itemId/evidence'");
  const end = workflow.indexOf("app.get('/api/sesi/:sesiId/items/:itemId/evidence/:evidenceId/download'",start);
  assert.ok(start >= 0 && end > start);
  const upload = workflow.slice(start,end);
  const transaction = upload.indexOf('await atomic(c,async()=>');
  const lockSession = upload.indexOf('SELECT status FROM ulo_sesi WHERE id=$1 FOR UPDATE');
  const lockItem = upload.indexOf('SELECT id FROM ulo_item WHERE sesi_id=$1 AND id=$2 FOR UPDATE');
  const quota = upload.indexOf('existing.total>=PRIVATE_STORAGE_LIMITS.evidenceItemCount');
  const audit = upload.indexOf("audit(c,'EVIDENCE_UPLOADED'");
  assert.ok(transaction >= 0 && transaction < lockSession && lockSession < lockItem && lockItem < quota && quota < audit);
  assert.match(upload, /status!=='DRAFT'/);
});

test('metadata changes require expected revision and commit their audit together', () => {
  const hono = source('../functions/api/[[path]].js');
  const start = hono.indexOf("app.patch('/api/sesi/:sesiId'");
  const end = hono.indexOf("app.put('/api/sesi/:sesiId/items'",start);
  assert.ok(start >= 0 && end > start);
  const patch = hono.slice(start,end);
  assert.match(patch,/expected_revision wajib/);
  assert.match(patch,/SELECT status,revision FROM ulo_sesi WHERE id=\$1 FOR UPDATE/);
  assert.match(patch,/revision=revision\+1/);
  assert.match(patch,/await audit\(c,'SESI_UPDATED'/);
  assert.match(patch,/await publishLive\(c,'SESI_UPDATED'/);
  assert.ok(patch.indexOf("audit(c,'SESI_UPDATED'")<patch.indexOf('await publishLive'));
});

test('all audited master data mutations use one transaction boundary', () => {
  const hono = source('../functions/api/[[path]].js');
  const workflow = source('../functions/api/workflow-routes.js');
  const pdf = source('../functions/api/pdf-support.js');
  for(const event of ['PROJECT_UPDATED','PROJECT_ARCHIVED','TEMPLATE_CREATED','TEMPLATE_UPDATED','TEMPLATE_PUBLISHED','TEMPLATE_DELETED','APLIKASI_CREATED']){
    const marker = "audit(c,'"+event+"'";
    const start = hono.indexOf(marker);
    assert.ok(start >= 0, event);
    assert.match(hono.slice(Math.max(0,start-950),start),/atomic\(c,async\(\)=>/);
  }
  for(const event of ['PROJECT_PERSON_CREATED','PROJECT_PERSON_UPDATED','APLIKASI_UPDATED','APLIKASI_DELETED','DEFECT_COMMENTED','EVIDENCE_UPLOADED','EVIDENCE_DELETED']){
    assert.match(workflow,new RegExp("audit\\(c,'"+event+"'"));
  }
  assert.match(pdf,/runAtomic\(sql => q\(c, sql\), async \(\) =>/);
});
