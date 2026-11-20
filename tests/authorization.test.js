import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveProjectId, requireProjectRole} from '../src/auth/authorization.js';

test('resolveProjectId: untuk sesi, tenant ID diambil dari DB', async()=>{
  const requests=[];
  const db={query:async(sql,args)=>{requests.push([sql,args]);return {rows:[{project_id:42}]};}};
  assert.equal(await resolveProjectId(db,{sesiId:'17'}),42);
  assert.match(requests[0][0],/ulo_sesi/);
  assert.deepEqual(requests[0][1],['17']);
});

test('resolveProjectId: menolak identifier yang bukan integer positif',async()=>{
  const db={query:()=>{throw Error('Unexpected SQL');}};
  assert.equal(await resolveProjectId(db,{templateId:'../users'}),null);
});

test('requireProjectRole: body project_id palsu diabaikan',async()=>{
  let checks=0;
  const db={query:async(sql,args)=>{
    checks++;
    if(checks===1)return {rows:[{project_id:2}]};
    assert.equal(args[1],2);
    return {rows:[{role:'TESTER'}]};
  }};
  const req={db,params:{sesiId:'21'},body:{project_id:1},user:{id:9}};
  let status, payload, nextCalled=false;
  const res={status(code){status=code;return this;},json(data){payload=data;}};
  await requireProjectRole('ADMIN')(req,res,()=>{nextCalled=true;});
  assert.equal(status,403);
  assert.match(payload.error,/Butuh role/);
  assert.equal(nextCalled,false);
  assert.equal(checks,2);
});

test('requireProjectRole: user berizin sesuai project resource lolos',async()=>{
  let n=0;
  const db={query:async()=>({rows:[n++===0?{project_id:7}:{role:'TESTER'}]})};
  const req={db,params:{aplikasiId:'2'},user:{id:4}};
  let ok=false;
  await requireProjectRole('TESTER')(req,{status:()=>{throw Error('Denied');}},()=>{ok=true;});
  assert.equal(ok,true);
  assert.equal(req.projectId,7);
});
