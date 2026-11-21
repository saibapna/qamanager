// Private Supabase Storage gateway. The Worker secret is never sent to browsers.
import {createHash} from 'node:crypto';
const origin='https://kyzrhgfynbtlmzfwvdyg.supabase.co';
export const storageBucket='qamanager-private-files';
export const storageEnabled=env=>typeof env?.SUPABASE_STORAGE_SERVICE_ROLE_KEY==='string'&&env.SUPABASE_STORAGE_SERVICE_ROLE_KEY.length>40;
const ext={'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg'};
const digest=b=>createHash('sha256').update(b).digest('hex');
const validKey=k=>typeof k==='string'&&/^projects\/[1-9]\d*\/(evidence|fixtures|output)\/[0-9a-f-]{36}-[0-9a-f]{64}\.(pdf|png|jpg)$/.test(k);
function url(key,authenticated=false){
  if(!validKey(key))throw Error('Invalid storage key');
  return origin+'/storage/v1/object/'+(authenticated?'authenticated/':'')+storageBucket+'/'+key.split('/').map(encodeURIComponent).join('/');
}
const headers=env=>({apikey:env.SUPABASE_STORAGE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_STORAGE_SERVICE_ROLE_KEY});
export async function storeFile(env,projectId,kind,bytes,mime,sha){
  if(!storageEnabled(env))return null;
  if(!Number.isSafeInteger(Number(projectId))||Number(projectId)<1||!['evidence','fixtures','output'].includes(kind)||!ext[mime]||digest(bytes)!==sha)
    throw Error('Invalid storage upload');
  const key='projects/'+projectId+'/'+kind+'/'+crypto.randomUUID()+'-'+sha+'.'+ext[mime];
  const res=await fetch(url(key),{method:'POST',headers:{...headers(env),'Content-Type':mime,'x-upsert':'false'},body:bytes,signal:AbortSignal.timeout(20000)});
  if(!res.ok){console.error('qamanager_storage_write',res.status);throw Error('Supabase private storage write failed');}
  return key;
}
export async function readFile(env,key,sha,expectedSize){
  if(!storageEnabled(env))throw Error('Supabase private storage key missing');
  const res=await fetch(url(key,true),{headers:headers(env),signal:AbortSignal.timeout(20000)});
  if(!res.ok){console.error('qamanager_storage_read',res.status);throw Error('Supabase private storage read failed');}
  const bytes=new Uint8Array(await res.arrayBuffer());
  if(bytes.length!==Number(expectedSize)||digest(bytes)!==sha){console.error('qamanager_storage_checksum_failed');throw Error('Private storage checksum mismatch');}
  return bytes;
}
export async function cleanupUncommitted(env,key){
  if(!key)return;
  try{
    const r=await fetch(url(key),{method:'DELETE',headers:headers(env),signal:AbortSignal.timeout(20000)});
    if(!r.ok&&r.status!==404)console.error('qamanager_storage_orphan_cleanup',r.status);
  }catch(e){console.error('qamanager_storage_orphan_cleanup',e?.name||'Error')}
}
