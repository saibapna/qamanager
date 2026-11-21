import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {storageBucket,storageEnabled,storeFile,readFile,cleanupUncommitted} from '../functions/api/private-storage.js';

const env={SUPABASE_STORAGE_SERVICE_ROLE_KEY:'test-privileged-secret-only-for-unit-tests-00000000000'};
const data=new TextEncoder().encode('%PDF-test-data-for-private-object');
const digest=createHash('sha256').update(data).digest('hex');
const nativeFetch=globalThis.fetch;

test('server private storage adapter stays disabled without privileged secret',async()=>{
  assert.equal(storageBucket,'qamanager-private-files');
  assert.equal(storageEnabled({}),false);
  assert.equal(await storeFile({},1,'output',data,'application/pdf',digest),null);
});
test('upload and read use signed-in server secret only; SHA256/size verified',async()=>{
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),method:options.method||'GET',headers:options.headers});
    if(options.method==='POST')return new Response('{"Key":"ok"}',{status:200});
    return new Response(data,{status:200});
  };
  try{
    const key=await storeFile(env,14,'output',data,'application/pdf',digest);
    assert.match(key,/^projects\/14\/output\//);
    assert.equal((await readFile(env,key,digest,data.length)).length,data.length);
    assert.equal(calls.length,2);
    assert.match(calls[0].url,/\/storage\/v1\/object\/qamanager-private-files\//);
    assert.match(calls[1].url,/\/storage\/v1\/object\/authenticated\/qamanager-private-files\//);
    assert.equal(calls[0].headers.Authorization,'Bearer '+env.SUPABASE_STORAGE_SERVICE_ROLE_KEY);
    assert.equal(calls[1].headers.apikey,env.SUPABASE_STORAGE_SERVICE_ROLE_KEY);
    assert.ok(calls.every(x=>!x.url.includes(env.SUPABASE_STORAGE_SERVICE_ROLE_KEY)));
  }finally{globalThis.fetch=nativeFetch;}
});
test('read fails closed on bad content hash or size and rejects invalid keys',async()=>{
  globalThis.fetch=async()=>new Response(data,{status:200});
  const key='projects/14/output/123e4567-e89b-42d3-a456-426614174000-'+digest+'.pdf';
  try{
    await assert.rejects(readFile(env,key,'0'.repeat(64),data.length),/checksum mismatch/);
    await assert.rejects(readFile(env,key,digest,data.length+1),/checksum mismatch/);
    await assert.rejects(readFile(env,'../cross-tenant',digest,data.length),/Invalid storage key/);
  }finally{globalThis.fetch=nativeFetch;}
});
test('cleanup never deletes existing objects unless explicit uncommitted key is passed',async()=>{
  let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(null,{status:204})};
  try{await cleanupUncommitted(env,null);assert.equal(calls,0);}
  finally{globalThis.fetch=nativeFetch;}
});
