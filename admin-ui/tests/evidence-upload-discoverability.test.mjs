import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const session=source('../src/pages/SesiDetailPage.tsx');
const evidence=source('../src/components/UatWorkflowPanel.tsx');
const project=source('../src/pages/ProjectDetailPage.tsx');
const api=source('../functions/api/workflow-routes.js');

test('project session list links to evidence upload for editable draft sessions',()=>{
  assert.match(project,/canEdit&&s\.status==='DRAFT'&&<Link to=/);
  assert.match(project,/\/sesi\/\$\{s\.id\}#evidence-uji/);
});
test('session page exposes upload action and one-click evidence access from each test case',()=>{
  assert.match(session,/<a href="#evidence-uji" className="inline-flex/);
  assert.match(session,/Unggah bukti/);
  assert.match(session,/onClick=\{\(\)=>setSelectedEvidenceItemId\(it\.id\)\}/);
  assert.match(session,/selectedEvidenceItemId=\{selectedEvidenceItemId\}/);
  assert.match(session,/onSelectEvidenceItem=\{setSelectedEvidenceItemId\}/);
});
test('private evidence uploader is visible near the top, scoped to DRAFT ADMIN or TESTER and selected case',()=>{
  assert.match(evidence,/const canUpload=status==='DRAFT'&&\['ADMIN','TESTER'\]/);
  assert.match(evidence,/<section id="evidence-uji"/);
  assert.ok(evidence.indexOf('id="evidence-uji"')<evidence.indexOf('Defect & Retest'));
  assert.match(evidence,/type="file" accept="\.pdf,\.png,\.jpg,\.jpeg/);
  assert.match(evidence,/file\.size>4\*1024\*1024/);
  assert.match(evidence,/upload\.mutate\(\{itemId,file\}\)/);
  assert.match(evidence,/queryKey:\['evidence',sessionId,vars\.itemId\]/);
  assert.match(evidence,/Unggah hanya tersedia untuk ADMIN atau TESTER/);
  assert.doesNotMatch(evidence,/supabase\.storage\.from\(/);
});
test('upload goes through project-guarded Hono backend and keeps private storage checks',()=>{
  assert.match(api,/app\.post\('\/api\/sesi\/:sesiId\/items\/:itemId\/evidence'/);
  assert.match(api,/guard\(c,'sesiId',\['ADMIN','TESTER'\]\)/);
  assert.match(api,/storeFile\(c\.env,pid,'evidence'/);
});
