import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import { Client } from 'pg';

const app=new Hono();
const allRoles=['ADMIN','TESTER','WITNESS','APPROVER','AUDITOR'];
const canEdit=['ADMIN','TESTER'];
const isStr=s=>typeof s==='string'&&s.trim().length>0;
const time=()=>Math.floor(Date.now()/1000);
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,msg)=>{throw new ApiError(status,msg);};
const id=x=>{if(!/^[1-9]\d*$/.test(String(x))||!Number.isSafeInteger(Number(x)))fail(400,'ID tidak valid');return Number(x);};
const q=(c,s,p=[])=>c.get('db').query(s,p);
const first=async(c,s,p)=>(await q(c,s,p)).rows[0];
const json=async c=>{if(Number(c.req.header('content-length')||0)>1024*1024)fail(413,'Payload terlalu besar');return await c.req.json().catch(()=>fail(400,'JSON tidak valid'));};
const sha=async t=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const base64url=s=>atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));
async function passVerify(hash,password){
  if(typeof hash!=='string'||typeof password!=='string'||password.length>200)return false;
  const [method,rounds,salt,expected,...extra]=hash.split('$');
  if(method!=='pbkdf2_sha256'||extra.length||!rounds||!salt||!expected)return false;
  const iteration=Number(rounds);
  if(!Number.isInteger(iteration)||iteration<100000||iteration>2000000)return false;
  try{
    const saltBytes=Uint8Array.from(base64url(salt),c=>c.charCodeAt(0));
    const expectedBytes=Uint8Array.from(base64url(expected),c=>c.charCodeAt(0));
    if(saltBytes.length<16||expectedBytes.length!==32)return false;
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
    const actual=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:saltBytes,iterations:iteration,hash:'SHA-256'},key,256));
    let diff=0;for(let i=0;i<32;i++)diff|=actual[i]^expectedBytes[i];return diff===0;
  }catch(error){console.error('qamanager_password_crypto',error?.name||'Error',error?.message||'unknown');return false;}
}
const jwt=async(c,person,kind)=>sign({sub:String(person.id),kind,iat:time(),exp:time()+(kind==='access'?900:604800),...(kind==='refresh'?{jti:crypto.randomUUID()}:{})},kind==='access'?c.env.JWT_ACCESS_SECRET:c.env.JWT_REFRESH_SECRET,'HS256');
const members=async(c,uid)=>(await q(c,`SELECT pm.project_id,p.kode,p.nama,pm.role FROM project_members pm JOIN projects p ON p.id=pm.project_id WHERE pm.user_id=$1 AND p.aktif=TRUE ORDER BY p.kode`,[uid])).rows;
const audit=async(c,action,kind,entity,meta={})=>q(c,`INSERT INTO audit_events(project_id,actor_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6)`,[c.get('pid')||null,c.get('uid'),action,kind,entity,JSON.stringify(meta)]);
const lookups={
  projectId:'SELECT id AS project_id FROM projects WHERE id=$1 AND aktif=TRUE',
  templateId:'SELECT t.project_id FROM templates t JOIN projects p ON p.id=t.project_id WHERE t.id=$1 AND p.aktif=TRUE',
  aplikasiId:'SELECT a.project_id FROM aplikasi a JOIN projects p ON p.id=a.project_id WHERE a.id=$1 AND p.aktif=TRUE',
  sesiId:'SELECT s.project_id FROM ulo_sesi s JOIN projects p ON p.id=s.project_id WHERE s.id=$1 AND p.aktif=TRUE'
};
async function guard(c,key,allowed=allRoles){
  const rid=id(c.req.param(key));const r=await first(c,lookups[key],[rid]);if(!r)fail(404,'Resource tidak ditemukan');
  const m=await first(c,'SELECT role FROM project_members WHERE user_id=$1 AND project_id=$2',[c.get('uid'),r.project_id]);
  if(!m||!allowed.includes(m.role))fail(403,'Akses project ditolak');
  c.set('pid',r.project_id);return r.project_id;
}

app.onError((error,c)=>{
 if(error instanceof ApiError)return c.json({error:error.message},error.status);
 if(error.code==='23505')return c.json({error:'Data duplikat'},409);
 if(error.code==='23503'||error.code==='23514')return c.json({error:'Validasi atau relasi database gagal'},400);
 console.error('qamanager_hono',error?.message||'error');return c.json({error:'Kesalahan server'},500);
});
const missingBindings=c=>[
  ...(!c.env.HYPERDRIVE?.connectionString?['HYPERDRIVE']:[]),
  ...(!c.env.JWT_ACCESS_SECRET?['JWT_ACCESS_SECRET']:[]),
  ...(!c.env.JWT_REFRESH_SECRET?['JWT_REFRESH_SECRET']:[]),
];
app.use('/api/*',async(c,next)=>{
  c.header('X-Content-Type-Options','nosniff');c.header('Cache-Control','no-store');
  // Status is public and must remain inspectable before database credentials are configured.
  if(c.req.path==='/api/status')return next();
  const missing=missingBindings(c);
  if(missing.length)return c.json({error:'Konfigurasi server belum lengkap',missing_bindings:missing},503);
  const db=new Client({connectionString:c.env.HYPERDRIVE.connectionString,options:'-c search_path=ulo_uat,public',connectionTimeoutMillis:8000});
  try{await db.connect();}catch(error){console.error('qamanager_database_connect',error?.message||'error');return c.json({error:'Koneksi database tidak tersedia'},503);}
  c.set('db',db);try{await next();}finally{await db.end();}
});
app.get('/api/status',c=>{
  const missing=missingBindings(c);
  return c.json({service:'qamanager',runtime:'cloudflare-hono',ready:missing.length===0,database:missing.includes('HYPERDRIVE')?'not_configured':'configured_not_checked',pdf:'separate-service-required',missing_bindings:missing},missing.length?503:200);
});
app.get('/api/health',async c=>{await q(c,'SELECT 1');return c.json({ok:true,runtime:'hono',database:'connected'});});
app.get('/api/health/auth-check',async c=>{
  // Diagnostic uses synthetic, non-secret credentials. No user password is inspected or returned.
  const probeHash='pbkdf2_sha256$310000$ZmFrZS10ZXN0LXNhbHQtMTIzNDU2Nzg5$71tsxSsxRB3B_fN7Akl4W-0vLX-h6I3f8mMvt0N-W5k';
  const cryptography=await passVerify(probeHash,'QA-Manager-crypto-self-test-2026');
  const row=await first(c,"SELECT EXISTS(SELECT 1 FROM users WHERE email='admin@qamanager.local' AND aktif=TRUE) AS readable");
  return c.json({ok:cryptography&&row?.readable===true,crypto_pbkdf2:cryptography,admin_record_visible:row?.readable===true},cryptography&&row?.readable===true?200:503);
});
app.post('/api/auth/login',async c=>{
  const d=await json(c);if(!isStr(d?.email)||typeof d.password!=='string')fail(400,'Email dan password wajib');
  const user=await first(c,'SELECT id,email,nama,password_hash,aktif FROM users WHERE lower(email)=lower($1)',[d.email.trim()]);
  if(!user?.aktif||!await passVerify(user.password_hash,d.password))fail(401,'Kredensial salah');
  const refreshToken=await jwt(c,user,'refresh');await q(c,'INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2,to_timestamp($3))',[user.id,await sha(refreshToken),time()+604800]);
  return c.json({accessToken:await jwt(c,user,'access'),refreshToken,user:{id:user.id,email:user.email,nama:user.nama,projects:await members(c,user.id)}});
});
app.post('/api/auth/refresh',async c=>{
  const d=await json(c);let tok;
  try{tok=await verify(d?.refreshToken,c.env.JWT_REFRESH_SECRET,'HS256');}catch{fail(401,'Refresh token tidak valid');}
  if(tok.kind!=='refresh')fail(401,'Jenis token tidak valid');
  const uid=id(tok.sub);await q(c,'BEGIN');try{
    const update=await q(c,'UPDATE refresh_tokens SET revoked=TRUE WHERE user_id=$1 AND token_hash=$2 AND revoked=FALSE AND expires_at>now() RETURNING id',[uid,await sha(d.refreshToken)]);
    if(!update.rowCount)fail(401,'Refresh token tidak berlaku');
    const u=await first(c,'SELECT id,email,nama FROM users WHERE id=$1 AND aktif=TRUE',[uid]);if(!u)fail(401,'Akun nonaktif');
    const refreshToken=await jwt(c,u,'refresh');await q(c,'INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2,to_timestamp($3))',[uid,await sha(refreshToken),time()+604800]);
    await q(c,'COMMIT');return c.json({accessToken:await jwt(c,u,'access'),refreshToken,user:{...u,projects:await members(c,uid)}});
  }catch(e){await q(c,'ROLLBACK');throw e;}
});
app.use('/api/*',async(c,next)=>{
  if(['/api/health','/api/status','/api/auth/login','/api/auth/refresh'].includes(c.req.path))return next();
  const h=c.req.header('authorization')||'';if(!h.startsWith('Bearer '))fail(401,'Unauthorized');let claims;
  try{claims=await verify(h.slice(7),c.env.JWT_ACCESS_SECRET,'HS256');}catch{fail(401,'Token tidak valid');}
  if(claims.kind!=='access')fail(401,'Jenis token tidak valid');
  const uid=id(claims.sub);if(!await first(c,'SELECT id FROM users WHERE id=$1 AND aktif=TRUE',[uid]))fail(401,'Akun tidak aktif');
  c.set('uid',uid);return next();
});
app.get('/api/auth/me',async c=>{const u=await first(c,'SELECT id,email,nama FROM users WHERE id=$1',[c.get('uid')]);return c.json({...u,projects:await members(c,u.id)});});
app.post('/api/auth/logout',async c=>{const d=await json(c);if(typeof d?.refreshToken==='string')await q(c,'UPDATE refresh_tokens SET revoked=TRUE WHERE user_id=$1 AND token_hash=$2',[c.get('uid'),await sha(d.refreshToken)]);return c.json({ok:true});});
app.get('/api/projects',async c=>c.json((await q(c,`SELECT p.* FROM projects p JOIN project_members pm ON pm.project_id=p.id WHERE pm.user_id=$1 AND p.aktif=TRUE ORDER BY p.kode`,[c.get('uid')])).rows));
app.post('/api/projects',async c=>{const d=await json(c);if(![d?.kode,d?.nama,d?.instansi].every(isStr))fail(400,'Kode, nama, instansi wajib');await q(c,'BEGIN');try{const p=await first(c,'INSERT INTO projects(kode,nama,instansi,bidang) VALUES($1,$2,$3,$4) RETURNING *',[d.kode.trim().toUpperCase(),d.nama.trim(),d.instansi.trim(),d.bidang||null]);await q(c,"INSERT INTO project_members(user_id,project_id,role) VALUES($1,$2,'ADMIN')",[c.get('uid'),p.id]);c.set('pid',p.id);await audit(c,'PROJECT_CREATED','project',p.id);await q(c,'COMMIT');return c.json(p,201);}catch(e){await q(c,'ROLLBACK');throw e;}});
app.get('/api/projects/:projectId',async c=>{const pid=await guard(c,'projectId');return c.json(await first(c,'SELECT * FROM projects WHERE id=$1',[pid]));});
app.patch('/api/projects/:projectId',async c=>{const pid=await guard(c,'projectId',['ADMIN']),d=await json(c),keys=['nama','instansi','bidang'].filter(k=>d?.[k]!==undefined);if(!keys.length)fail(400,'Tidak ada perubahan');if(keys.some(k=>k!=='bidang'&&!isStr(d[k])))fail(400,'Field wajib');const args=[...keys.map(k=>d[k]),pid];const p=await first(c,`UPDATE projects SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE id=$${args.length} RETURNING *`,args);await audit(c,'PROJECT_UPDATED','project',pid);return c.json(p);});
app.delete('/api/projects/:projectId',async c=>{const pid=await guard(c,'projectId',['ADMIN']);await q(c,'UPDATE projects SET aktif=FALSE WHERE id=$1',[pid]);await audit(c,'PROJECT_ARCHIVED','project',pid);return c.body(null,204);});
app.get('/api/projects/:projectId/templates',async c=>{const pid=await guard(c,'projectId');return c.json((await q(c,'SELECT id,versi,nama,published,checksum,created_at FROM templates WHERE project_id=$1 ORDER BY created_at DESC',[pid])).rows);});
app.post('/api/projects/:projectId/templates',async c=>{const pid=await guard(c,'projectId',['ADMIN']),d=await json(c);if(![d?.versi,d?.nama,d?.layout_hbs].every(isStr)||!d?.kategori_map||!d?.page_map)fail(400,'Template tidak lengkap');const checksum=await sha(d.layout_hbs+JSON.stringify(d.partials||{}));const t=await first(c,'INSERT INTO templates(project_id,versi,nama,layout_hbs,partials,kategori_map,page_map,checksum) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[pid,d.versi,d.nama,d.layout_hbs,JSON.stringify(d.partials||{}),JSON.stringify(d.kategori_map),JSON.stringify(d.page_map),checksum]);await audit(c,'TEMPLATE_CREATED','template',t.id);return c.json(t,201);});
app.get('/api/templates/:templateId',async c=>{await guard(c,'templateId');return c.json(await first(c,'SELECT * FROM templates WHERE id=$1',[id(c.req.param('templateId'))]));});
app.patch('/api/templates/:templateId',async c=>{await guard(c,'templateId',['ADMIN']);const tid=id(c.req.param('templateId')),old=await first(c,'SELECT * FROM templates WHERE id=$1',[tid]);if(old.published)fail(409,'Template sudah published');const d=await json(c),keys=['nama','layout_hbs','partials','kategori_map','page_map'].filter(k=>d?.[k]!==undefined);if(!keys.length)return c.json(old);const args=keys.map(k=>['partials','kategori_map','page_map'].includes(k)?JSON.stringify(d[k]):d[k]);args.push(await sha((d.layout_hbs??old.layout_hbs)+JSON.stringify(d.partials??old.partials)),tid);const t=await first(c,`UPDATE templates SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')},checksum=$${keys.length+1} WHERE id=$${keys.length+2} AND published=FALSE RETURNING *`,args);await audit(c,'TEMPLATE_UPDATED','template',tid);return c.json(t);});
app.post('/api/templates/:templateId/publish',async c=>{await guard(c,'templateId',['ADMIN']);const tid=id(c.req.param('templateId'));const t=await first(c,'UPDATE templates SET published=TRUE WHERE id=$1 AND published=FALSE RETURNING *',[tid]);if(!t)fail(409,'Template sudah published');await audit(c,'TEMPLATE_PUBLISHED','template',tid);return c.json(t);});
app.delete('/api/templates/:templateId',async c=>{await guard(c,'templateId',['ADMIN']);const tid=id(c.req.param('templateId'));const t=await first(c,'SELECT published FROM templates WHERE id=$1',[tid]);if(t.published)fail(409,'Template published tidak dapat dihapus');await q(c,'DELETE FROM templates WHERE id=$1',[tid]);await audit(c,'TEMPLATE_DELETED','template',tid);return c.body(null,204);});
app.get('/api/projects/:projectId/aplikasi',async c=>{const pid=await guard(c,'projectId');return c.json((await q(c,'SELECT * FROM aplikasi WHERE project_id=$1 ORDER BY nama_singkat',[pid])).rows);});
app.post('/api/projects/:projectId/aplikasi',async c=>{const pid=await guard(c,'projectId',canEdit),d=await json(c);if(!isStr(d?.nama_singkat))fail(400,'nama_singkat wajib');const a=await first(c,'INSERT INTO aplikasi(project_id,nama_singkat,nama_panjang,url) VALUES($1,$2,$3,$4) RETURNING *',[pid,d.nama_singkat,d.nama_panjang||null,d.url||null]);await audit(c,'APLIKASI_CREATED','aplikasi',a.id);return c.json(a,201);});
app.get('/api/aplikasi/:aplikasiId/sesi',async c=>{await guard(c,'aplikasiId');return c.json((await q(c,'SELECT * FROM ulo_sesi WHERE aplikasi_id=$1 ORDER BY created_at DESC',[id(c.req.param('aplikasiId'))])).rows);});
app.post('/api/aplikasi/:aplikasiId/sesi',async c=>{const pid=await guard(c,'aplikasiId',canEdit),d=await json(c);const t=await first(c,'SELECT id FROM templates WHERE id=$1 AND project_id=$2 AND published=TRUE',[id(d?.template_id),pid]);if(!t)fail(400,'Template project wajib published');const allowed=['hari','tanggal','pukul','tempat','jenis','penguji_nama','penguji_jabatan','penguji_email','penguji_telp','penguji_nip','saksi_nama','saksi_jabatan','saksi_email','saksi_telp','catatan','temuan'];const fields=allowed.filter(k=>d[k]!==undefined),vals=[pid,id(c.req.param('aplikasiId')),t.id,...fields.map(k=>d[k])];const s=await first(c,`INSERT INTO ulo_sesi(project_id,aplikasi_id,template_id${fields.length?','+fields.join(','):''}) VALUES(${vals.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,vals);await audit(c,'SESI_CREATED','sesi',s.id);return c.json(s,201);});
app.get('/api/sesi/:sesiId',async c=>{await guard(c,'sesiId');const sid=id(c.req.param('sesiId')),s=await first(c,'SELECT * FROM ulo_sesi WHERE id=$1',[sid]);const items=(await q(c,'SELECT * FROM ulo_item WHERE sesi_id=$1 ORDER BY urutan',[sid])).rows;return c.json({...s,items,ringkasan:{total:items.length,lulus:items.filter(i=>i.status==='PASS').length,gagal:items.filter(i=>i.status==='FAIL').length,belum:items.filter(i=>i.status==='BELUM').length}});});
app.patch('/api/sesi/:sesiId',async c=>{await guard(c,'sesiId',canEdit);const d=await json(c),sid=id(c.req.param('sesiId')),allowed=['hari','tanggal','pukul','tempat','jenis','penguji_nama','penguji_jabatan','penguji_email','penguji_telp','penguji_nip','saksi_nama','saksi_jabatan','saksi_email','saksi_telp','catatan','temuan'],keys=allowed.filter(k=>d?.[k]!==undefined);if(!keys.length)fail(400,'Tidak ada perubahan');const vals=[...keys.map(k=>d[k]),sid],s=await first(c,`UPDATE ulo_sesi SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE id=$${vals.length} AND status='DRAFT' RETURNING *`,vals);if(!s)fail(409,'Sesi tidak dapat diubah setelah FINAL');await audit(c,'SESI_UPDATED','sesi',sid);return c.json(s);});
app.put('/api/sesi/:sesiId/items',async c=>{await guard(c,'sesiId',canEdit);const sid=id(c.req.param('sesiId')),d=await json(c),items=d?.items;if(!Array.isArray(items)||!items.length||items.length>1000)fail(400,'items wajib 1-1000');const ids=new Set(),orders=new Set();for(const it of items){if(!isStr(it?.no)||!isStr(it?.kategori)||!isStr(it?.kebutuhan)||!['PASS','FAIL','BELUM'].includes(it?.status)||!Number.isInteger(it?.urutan)||it.urutan<1||ids.has(it.no)||orders.has(it.urutan))fail(400,'Item tidak valid atau duplikat');ids.add(it.no);orders.add(it.urutan);}await q(c,'BEGIN');try{const s=await first(c,'SELECT status FROM ulo_sesi WHERE id=$1 FOR UPDATE',[sid]);if(s?.status!=='DRAFT')fail(409,'Hanya sesi DRAFT dapat diubah');await q(c,'DELETE FROM ulo_item WHERE sesi_id=$1',[sid]);for(const it of items)await q(c,'INSERT INTO ulo_item(sesi_id,no,kategori,kebutuhan,hasil,status,urutan) VALUES($1,$2,$3,$4,$5,$6,$7)',[sid,it.no,it.kategori,it.kebutuhan,it.hasil??null,it.status,it.urutan]);await audit(c,'ITEMS_REPLACED','sesi',sid,{count:items.length});await q(c,'COMMIT');return c.json({ok:true,count:items.length});}catch(e){await q(c,'ROLLBACK');throw e;}});
app.get('/api/sesi/:sesiId/outputs',async c=>{await guard(c,'sesiId');return c.json((await q(c,'SELECT id,versi,pdf_path,sha256,size_bytes,page_count,generated_at FROM ulo_output WHERE sesi_id=$1 ORDER BY versi DESC',[id(c.req.param('sesiId'))])).rows);});
app.post('/api/sesi/:sesiId/finalize',async c=>{await guard(c,'sesiId',['ADMIN','APPROVER']);const sid=id(c.req.param('sesiId'));await q(c,'BEGIN');try{const s=await first(c,'SELECT status FROM ulo_sesi WHERE id=$1 FOR UPDATE',[sid]);if(s?.status!=='DRAFT')fail(409,'Hanya DRAFT yang dapat difinalisasi');const items=(await q(c,'SELECT no,status FROM ulo_item WHERE sesi_id=$1',[sid])).rows;if(!items.length||items.some(i=>i.status==='BELUM'))fail(422,'Semua item wajib diuji');const gates=['X1','X2','X3','X4','X5'];if(items.some(i=>gates.includes(i.no))&&gates.some(n=>items.find(i=>i.no===n)?.status!=='PASS'))fail(422,'Gate X1-X5 wajib PASS');const result=await first(c,"UPDATE ulo_sesi SET status='FINAL' WHERE id=$1 RETURNING *",[sid]);await audit(c,'SESI_FINALIZED','sesi',sid);await q(c,'COMMIT');return c.json(result);}catch(e){await q(c,'ROLLBACK');throw e;}});
for(const action of ['/api/sesi/:sesiId/pdf'])app.post(action,async c=>{await guard(c,'sesiId',canEdit);return c.json({error:'PDF memerlukan service Chromium terpisah'},501);});
for(const action of ['/api/templates/:templateId/fixtures','/api/templates/:templateId/validate','/api/templates/:templateId/diff'])app.post(action,async c=>{await guard(c,'templateId');return c.json({error:'Fitur PDF/fixture belum tersedia di Cloudflare'},501);});
app.get('/api/diff-file/:templateId/:runId/:folder/:filename',async c=>{await guard(c,'templateId');return c.json({error:'PDF diff tidak tersedia'},501);});
export async function onRequest(ctx){return app.fetch(ctx.request,ctx.env,ctx);}
export {app};
