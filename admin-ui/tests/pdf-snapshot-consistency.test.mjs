import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPdfSnapshotCurrent } from '../functions/api/workflow-core.js';

test('a PDF snapshot remains valid only while revision AND status are unchanged',()=>{
  assert.equal(isPdfSnapshotCurrent(4,'DRAFT',{revision:4,status:'DRAFT'}),true);
  assert.equal(isPdfSnapshotCurrent('4','FINAL',{revision:4,status:'FINAL'}),true);
  assert.equal(isPdfSnapshotCurrent(4,'DRAFT',{revision:5,status:'DRAFT'}),false);
  assert.equal(isPdfSnapshotCurrent(4,'DRAFT',{revision:4,status:'FINAL'}),false);
  assert.equal(isPdfSnapshotCurrent(4,'FINAL',{revision:4,status:'SIGNED'}),false);
  assert.equal(isPdfSnapshotCurrent(0,'DRAFT',{revision:0,status:'DRAFT'}),false);
  assert.equal(isPdfSnapshotCurrent(4,'FINAL',null),false);
  assert.equal(isPdfSnapshotCurrent('not-a-number','DRAFT',{revision:4,status:'DRAFT'}),false);
});

test('pdf renderer pins UAT source and checks against locked session before storing output',()=>{
  const source=readFileSync(new URL('../functions/api/pdf-support.js',import.meta.url),'utf8');
  const start=source.indexOf("app.post('/api/sesi/:sesiId/pdf'");
  const end=source.indexOf("app.get('/api/sesi/:sesiId/outputs/:outputId/download'",start);
  assert.ok(start>=0&&end>start);
  const route=source.slice(start,end);
  const initial=route.indexOf('const sourceRevision=Number(sesi.revision)');
  const sourceDigest=route.indexOf('const sourceHtmlSha256=hashPdf(');
  const render=route.indexOf("BROWSER.quickAction('pdf'");
  const begin=route.indexOf("await q(c, 'BEGIN')");
  const lock=route.indexOf('SELECT revision,status FROM ulo_sesi WHERE id=$1 FOR UPDATE');
  const check=route.indexOf('isPdfSnapshotCurrent(sourceRevision,sourceStatus,current)');
  const insert=route.indexOf('INSERT INTO ulo_output(');
  const audit=route.indexOf("audit(c, 'PDF_GENERATED'");
  assert.ok(initial>=0 && initial<sourceDigest && sourceDigest<render && render<begin &&
    begin<lock && lock<check && check<insert && insert<audit);
  assert.match(route,/fail\(409,'Sesi berubah saat PDF sedang dibuat/);
  assert.match(route,/source_html_sha256: sourceHtmlSha256/);
  assert.match(route,/source_revision: sourceRevision/);
  assert.match(route,/render_ms: renderMs/);
  assert.match(route,/await q\(c, 'ROLLBACK'\)/);
});

test('auditor UI exposes checksum metadata but no raw PDF content',()=>{
  const page=readFileSync(new URL('../src/pages/ProjectOpsPage.tsx',import.meta.url),'utf8');
  assert.match(page,/Metadata audit dan bukti checksum/);
  assert.match(page,/JSON.stringify\(a.metadata,null,2\)/);
  assert.doesNotMatch(page,/JSON.stringify\(a\.password/);
});
