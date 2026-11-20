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
if(existsSync(target))throw Error('Refusing to overwrite real Worker artifact');
mkdirSync(directory,{recursive:true});
writeFileSync(target,'export default {fetch(){return new Response("ok")}};\n');
process.on('exit',()=>{
  try{unlinkSync(target);}catch{}
  try{rmdirSync(directory);}catch{}
});
const execute=failure=>spawnSync(process.execPath,['--import',mock,entry],{
  cwd:root,
  env:{
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID:'11111111111111111111111111111111',
    CLOUDFLARE_API_TOKEN:'unit-test-never-a-valid-token',
    MOCK_HEALTH_FAILURE:failure?'1':'0'
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
