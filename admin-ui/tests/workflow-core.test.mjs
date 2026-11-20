import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { assertCanonicalItems, checkFinalization, hashCloudflarePassword } from '../functions/api/workflow-core.js';

const plan=[
  {no:'A1',kategori:'A',kebutuhan:'Login',urutan:1},
  {no:'X1',kategori:'X',kebutuhan:'Gate',urutan:2},
];
const items=[
  {...plan[0],status:'PASS',hasil:'Berhasil'},
  {...plan[1],status:'PASS',hasil:'Berhasil'},
];
test('kanonis: seluruh item wajib cocok, tidak bisa dikurangi atau diubah',()=>{
  assert.doesNotThrow(()=>assertCanonicalItems(items,plan));
  assert.throws(()=>assertCanonicalItems(items.slice(0,1),plan),/Jumlah item/);
  assert.throws(()=>assertCanonicalItems([{...items[0],kebutuhan:'dihapus'},items[1]],plan),/berbeda/);
  assert.throws(()=>assertCanonicalItems([items[0],items[0]],plan),/berbeda/);
  assert.throws(()=>assertCanonicalItems([{...items[0],hasil:''},items[1]],plan),/Hasil wajib/);
});
test('finalisasi: status BELUM ditolak',()=>{
  const changed=items.map((i,k)=>k?{...i,status:'BELUM',hasil:''}:i);
  assert.equal(checkFinalization(changed,plan).ok,false);
});
test('finalisasi: gate diwajibkan hanya pada project yang mengaktifkan gate',()=>{
  assert.equal(checkFinalization(items,plan,{requireGateX:false}).ok,true);
  assert.equal(checkFinalization(items,plan,{requireGateX:true}).ok,false);
});
test('finalisasi: FAIL wajib defect verified+retest atau waived beralasan',()=>{
  const changed=[{...items[0],status:'FAIL',hasil:'Error'},items[1]];
  assert.equal(checkFinalization(changed,plan).ok,false);
  assert.equal(checkFinalization(changed,plan,{defects:[{item_no:'A1',status:'OPEN'}]}).ok,false);
  assert.equal(checkFinalization(changed,plan,{defects:[{item_no:'A1',status:'WAIVED'}]}).ok,false);
  assert.equal(checkFinalization(changed,plan,{defects:[{item_no:'A1',status:'WAIVED',resolution_note:'Disetujui risiko residual'}]}).ok,true);
  assert.equal(checkFinalization(changed,plan,{defects:[{item_no:'A1',status:'VERIFIED',last_retest:'FAIL'}]}).ok,false);
});
test('bcrypt tidak digunakan untuk Cloudflare: hash PBKDF2 fixed 100k + salt unik',()=>{
  const password='example-strong-password-for-tests-2026';
  const a=hashCloudflarePassword(password);
  const b=hashCloudflarePassword(password);
  assert.notEqual(a,b);
  const [type,rounds,salt,expected]=a.split('$');
  assert.equal(type,'pbkdf2_sha256');
  assert.equal(Number(rounds),100000);
  const real=pbkdf2Sync(password,Buffer.from(salt,'base64url'),100000,32,'sha256');
  assert.equal(timingSafeEqual(real,Buffer.from(expected,'base64url')),true);
  assert.throws(()=>hashCloudflarePassword('short'),/16/);
});
