import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync,unlinkSync,rmdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const entry=resolve(root,'.github/scripts/deploy-qamanager-worker.mjs');
const mock=pathToFileURL(resolve(root,'.github/scripts/mock-cloudflare-deploy-fetch.mjs')).href;
const target=resolve(root,'admin-ui/worker-dist/qamanager-worker.mjs');
const directory=resolve(root,'admin-ui/worker-dist');
// Use the already-built Worker artifact in CI; for isolated local tests create a throwaway fixture.
const createdFixture=!existsSync(target);
if(createdFixture){
  mkdirSync(directory,{recursive:true});
  writeFileSync(target,'export default {fetch(){return new Response("ok")}};\n');
}
process.on('exit',()=>{
  if(!createdFixture)return;
  try{unlinkSync(target);}catch{}
  try{rmdirSync(directory);}catch{}
});
const execute=(failure,options={})=>spawnSync(process.execPath,['--import',mock,entry],{
  cwd:root,
  env:{
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID:'11111111111111111111111111111111',
    CLOUDFLARE_API_TOKEN:'unit-test-never-a-valid-token',
    MOCK_HEALTH_FAILURE:failure?'1':'0',
    MOCK_R2_EXISTING:options.existingR2?'1':'0',
    MOCK_STORAGE_SECRET:options.storageSecret?'1':'0',
    QAMANAGER_R2_BUCKET:options.bucket||''
  },encoding:'utf8',timeout:18000
});
test('deployment smoke requires real database and preserves bindings',()=>{
  const run=execute(false);
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/Deploy PASS.*database connected/);
  assert.doesNotMatch(run.stderr,/MOCK_ROLLBACK_RECEIVED/);
});
test('failed health check automatically re-deploys the previous Worker version',()=>{
  const run=execute(true);
  assert.notEqual(run.status,0,'Unhealthy deployment must fail CI');
  assert.match(run.stderr,/MOCK_ROLLBACK_RECEIVED/);
  assert.match(run.stderr,/ROLLBACK SUCCESS/);
});

test('new private R2 binding is added only when explicitly configured',()=>{
  const run=execute(false,{bucket:'qamanager-staging-private'});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/R2_FILES=qamanager-staging-private/);
  assert.match(run.stdout,/storage migration NOT active/);
});
test('pre-existing R2 binding survives redeployment without configuration variable',()=>{
  const run=execute(false,{existingR2:true});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/R2_FILES=qamanager-staging-private/);
});
test('deployment fails closed when configured bucket differs from existing R2 binding',()=>{
  const run=execute(false,{existingR2:true,bucket:'wrong-bucket'});
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/bucket mismatch/);
  assert.doesNotMatch(run.stderr,/MOCK_ROLLBACK_RECEIVED/);
});

test('optional Supabase Storage secret survives Worker code deployment',()=>{
  const run=execute(false,{storageSecret:true});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/Deploy PASS/);
});
