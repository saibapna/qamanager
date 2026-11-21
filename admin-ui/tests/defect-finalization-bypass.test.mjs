import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertBulkItemTransition, checkFinalization, checkApprovalState } from '../functions/api/workflow-core.js';

const catalog=[
  {no:'A1',kategori:'A',kebutuhan:'Login',urutan:1},
  {no:'A2',kategori:'A',kebutuhan:'Pencarian',urutan:2}
];
const pass=catalog.map(item=>({...item,status:'PASS',hasil:'Berhasil'}));
const failing=[{...pass[0],status:'FAIL',hasil:'Gagal teruji'},pass[1]];
const verified={item_no:'A1',status:'VERIFIED',last_retest:'PASS'};
const waived={item_no:'A1',status:'WAIVED',resolution_note:'Risiko residual disetujui'};

test('unresolved defect ledger blocks FINAL even when all current item statuses are PASS',()=>{
  assert.equal(checkFinalization(pass,catalog).ok,true);
  for(const status of ['OPEN','IN_PROGRESS','FIXED','REOPENED']){
    const check=checkFinalization(pass,catalog,{defects:[{item_no:'A1',status}]});
    assert.equal(check.ok,false,status);
    assert.match(check.reason,/belum selesai/i);
  }
});

test('verified outcome requires the last retest PASS and matching current item PASS',()=>{
  assert.equal(checkFinalization(pass,catalog,{defects:[verified]}).ok,true);
  assert.equal(checkFinalization(pass,catalog,{defects:[{...verified,last_retest:'FAIL'}]}).ok,false);
  assert.equal(checkFinalization(failing,catalog,{defects:[verified]}).ok,false);
  assert.equal(checkFinalization(pass,catalog,{defects:[{item_no:'A9',status:'VERIFIED',last_retest:'PASS'}]}).ok,false);
});

test('waivers require written reason and the original FAIL result to remain traceable',()=>{
  assert.equal(checkFinalization(failing,catalog,{defects:[waived]}).ok,true);
  assert.equal(checkFinalization(failing,catalog,{defects:[{...waived,resolution_note:''}]}).ok,false);
  assert.equal(checkFinalization(pass,catalog,{defects:[waived]}).ok,false);
});

test('approval re-runs finalization and rejects concealed unresolved defect',()=>{
  const session={status:'FINAL',revision:1,finalized_at:'2026-11-21T00:00:00Z'};
  assert.equal(checkApprovalState(session,pass,catalog,{defects:[{item_no:'A1',status:'OPEN'}]}).ok,false);
  assert.equal(checkApprovalState(session,pass,catalog,{defects:[verified]}).ok,true);
});

test('bulk updates may not change a FAIL into BELUM, PASS, or alter FAIL result',()=>{
  const old={no:'A1',status:'FAIL',hasil:'Gagal teruji'};
  const changes=[
    {...old,status:'BELUM',hasil:''},
    {...old,status:'PASS',hasil:'Pengguna ingin lewat'},
    {...old,hasil:'Hasil ditimpa'}
  ];
  for(const next of changes){
    assert.throws(()=>assertBulkItemTransition(old,next,{status:'OPEN'}),/hanya dapat diubah melalui proses retest/i);
  }
  assert.doesNotThrow(()=>assertBulkItemTransition(old,{...old},{status:'OPEN'}));
});

test('a hidden historical defect cannot be updated to PASS via bulk editing',()=>{
  const previous={status:'BELUM',hasil:''};
  assert.throws(()=>assertBulkItemTransition(previous,{status:'PASS',hasil:'Lewati defect'},{status:'OPEN'}),/histori defect/);
  const afterRetest={status:'PASS',hasil:'Retest passed'};
  assert.throws(()=>assertBulkItemTransition(afterRetest,{status:'PASS',hasil:'Tamper with retest'},{status:'VERIFIED'}),/histori defect/);
  assert.doesNotThrow(()=>assertBulkItemTransition(afterRetest,{status:'FAIL',hasil:'New regression'},{status:'VERIFIED'}));
  assert.doesNotThrow(()=>assertBulkItemTransition({status:'BELUM',hasil:''},{status:'PASS',hasil:'New case'},null));
});

test('bulk route locks all defect rows before item writes and enforces pure transition guard',()=>{
  const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  const start=source.indexOf("app.put('/api/sesi/:sesiId/items'");
  const end=source.indexOf("app.get('/api/sesi/:sesiId/outputs'",start);
  assert.ok(start>=0&&end>start);
  const route=source.slice(start,end);
  const lock=route.indexOf('SELECT item_id,status FROM ulo_defects WHERE sesi_id=$1 FOR UPDATE');
  const validation=route.indexOf('assertBulkItemTransition(prior,item,defectsByItemId.get');
  const write=route.indexOf('UPDATE ulo_item SET status=$1,hasil=$2');
  assert.ok(lock>=0&&validation>lock&&write>validation);
  assert.match(route,/catch\(e\)\{fail\(409,e.message\);\}/);
});
