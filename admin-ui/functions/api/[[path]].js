import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import {getCookie,setCookie,deleteCookie} from 'hono/cookie';
import { Client, types } from 'pg';
// pg maps PostgreSQL BIGINT (OID 20) to string by default; UI must receive safe numeric IDs.
types.setTypeParser(20, value => {const number=Number(value);return Number.isSafeInteger(number)?number:value;});
import { installPdfRoutes } from './pdf-support.js';
import { installWorkflowRoutes } from './workflow-routes.js';
import { assertCanonicalItems, checkFinalization } from './workflow-core.js';
import { pbkdf2Sync, timingSafeEqual } from 'node:crypto';

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
  const iterations=Number(rounds);
  if(!Number.isInteger(iterations)||iterations<100000||iterations>100000)return false;
  try{
    // Workerd limits PBKDF2 to 100,000 iterations for both WebCrypto and node:crypto.
    // The stored credential format is validated before executing native PBKDF2.
    const saltBytes=Buffer.from(salt,'base64url');
    const expectedBytes=Buffer.from(expected,'base64url');
    if(saltBytes.length<16||expectedBytes.length!==32)return false;
    const actual=pbkdf2Sync(password,saltBytes,iterations,32,'sha256');
    return timingSafeEqual(actual,expectedBytes);
  }catch(error){
    console.error('qamanager_password_crypto',error?.name||'Error',error?.message||'unknown');
    return false;
  }
}
const jwt=async(c,person,kind,sessionId)=>sign({sub:String(person.id),kind,iat:time(),exp:time()+(kind==='access'?900:604800),...(kind==='refresh'?{jti:crypto.randomUUID()}:{sid:String(sessionId)})},kind==='access'?c.env.JWT_ACCESS_SECRET:c.env.JWT_REFRESH_SECRET,'HS256');
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

function setAuthCookies(c,accessToken,refreshToken){
  setCookie(c,'qa_access',accessToken,{httpOnly:true,secure:true,sameSite:'Strict',path:'/api',maxAge:900});
  setCookie(c,'qa_refresh',refreshToken,{httpOnly:true,secure:true,sameSite:'Strict',path:'/api/auth',maxAge:604800});
}
function clearAuthCookies(c){
  deleteCookie(c,'qa_access',{path:'/api',secure:true});
  deleteCookie(c,'qa_refresh',{path:'/api/auth',secure:true});
}
const missingBindings=c=>[
  ...(!c.env.HYPERDRIVE?.connectionString?['HYPERDRIVE']:[]),
  ...(!c.env.JWT_ACCESS_SECRET?['JWT_ACCESS_SECRET']:[]),
  ...(!c.env.JWT_REFRESH_SECRET?['JWT_REFRESH_SECRET']:[]),
];
app.use('/api/*',async(c,next)=>{
  c.header('X-Content-Type-Options','nosniff');c.header('Cache-Control','no-store');
  c.header('Referrer-Policy','no-referrer');
  if(['POST','PUT','PATCH','DELETE'].includes(c.req.method)){
    // Cookie-authenticated mutations require an explicit JavaScript request header.
    // Combined with Strict SameSite cookies and origin checks, this blocks CSRF forms.
    const usingCookie=String(c.req.header('cookie')||'').includes('qa_access=');
    if(usingCookie&&!String(c.req.header('authorization')||'').startsWith('Bearer ')&&c.req.header('x-requested-with')!=='XMLHttpRequest')fail(403,'Permintaan tanpa CSRF guard ditolak');
    const origin=c.req.header('origin');
    if(origin){
      let same=false;try{same=new URL(origin).origin===new URL(c.req.url).origin;}catch{}
      if(!same)fail(403,'Origin tidak diizinkan');
    }
  }
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
  return c.json({service:'qamanager',runtime:'cloudflare-hono',ready:missing.length===0,database:missing.includes('HYPERDRIVE')?'not_configured':'configured_not_checked',pdf:c.env.BROWSER?.quickAction?'browser-run':'browser-binding-missing',pdf_storage:'supabase_private_bytea',pdf_comparison:'sha256_exact_bytes',missing_bindings:missing},missing.length?503:200);
});
app.get('/api/health',async c=>{await q(c,'SELECT 1');return c.json({ok:true,runtime:'hono',database:'connected'});});

app.use('/api/auth/*',async(c,next)=>{
  if(!['/api/auth/login','/api/auth/refresh'].includes(c.req.path))return next();
  // IP-scoped throttling runs before credential verification, including refresh.
  const ip=c.req.header('cf-connecting-ip')||'unknown';
  const key=await sha('auth-ip:'+ip);
  const row=await first(c,
    "INSERT INTO auth_attempts(key_hash,attempts,window_started_at,updated_at) VALUES($1,1,now(),now()) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN auth_attempts.window_started_at<now()-interval '15 minutes' THEN 1 ELSE auth_attempts.attempts+1 END,window_started_at=CASE WHEN auth_attempts.window_started_at<now()-interval '15 minutes' THEN now() ELSE auth_attempts.window_started_at END,updated_at=now() RETURNING attempts",[key]);
  if(row.attempts>30)fail(429,'Terlalu banyak percobaan autentikasi; coba lagi dalam 15 menit');
  await next();
});
app.post('/api/auth/login',async c=>{
  const d=await json(c);if(!isStr(d?.email)||typeof d.password!=='string')fail(400,'Email dan password wajib');
  const attemptKey=await sha('auth-account:'+String(d.email).trim().toLowerCase()+':'+(c.req.header('cf-connecting-ip')||'unknown'));
  const past=await first(c,'SELECT attempts,window_started_at FROM auth_attempts WHERE key_hash=$1',[attemptKey]);
  if(past?.attempts>=6 && Date.now()-new Date(past.window_started_at).getTime()<900000)fail(429,'Akun sementara dibatasi setelah terlalu banyak percobaan');
  const user=await first(c,'SELECT id,email,nama,password_hash,aktif,is_platform_admin FROM users WHERE lower(email)=lower($1)',[d.email.trim()]);
  if(!user?.aktif||!await passVerify(user.password_hash,d.password)){
    await q(c,"INSERT INTO auth_attempts(key_hash,attempts,window_started_at,updated_at) VALUES($1,1,now(),now()) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN auth_attempts.window_started_at<now()-interval '15 minutes' THEN 1 ELSE auth_attempts.attempts+1 END,window_started_at=CASE WHEN auth_attempts.window_started_at<now()-interval '15 minutes' THEN now() ELSE auth_attempts.window_started_at END,updated_at=now()",[attemptKey]);
    fail(401,'Kredensial salah');
  }
  await q(c,'DELETE FROM auth_attempts WHERE key_hash=$1',[attemptKey]);
  const refreshToken=await jwt(c,user,'refresh');
  const session=await first(c,'INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2,to_timestamp($3)) RETURNING id',[user.id,await sha(refreshToken),time()+604800]);
  await q(c,"INSERT INTO audit_events(project_id,actor_id,action,entity_type,entity_id,metadata) VALUES(NULL,$1,'AUTH_LOGIN','user',$1,'{}'::jsonb)",[user.id]);
  const accessToken=await jwt(c,user,'access',session.id);setAuthCookies(c,accessToken,refreshToken);
  return c.json({user:{id:user.id,email:user.email,nama:user.nama,is_platform_admin:user.is_platform_admin,projects:await members(c,user.id)}});
});
app.post('/api/auth/refresh',async c=>{
  const d=await json(c);const incoming=d?.refreshToken||getCookie(c,'qa_refresh');let tok;
  try{tok=await verify(incoming,c.env.JWT_REFRESH_SECRET,'HS256');}catch{fail(401,'Refresh token tidak valid');}
  if(tok.kind!=='refresh')fail(401,'Jenis token tidak valid');
  const uid=id(tok.sub);await q(c,'BEGIN');try{
    const update=await q(c,'UPDATE refresh_tokens SET revoked=TRUE WHERE user_id=$1 AND token_hash=$2 AND revoked=FALSE AND expires_at>now() RETURNING id',[uid,await sha(incoming)]);
    if(!update.rowCount)fail(401,'Refresh token tidak berlaku');
    const u=await first(c,'SELECT id,email,nama,is_platform_admin FROM users WHERE id=$1 AND aktif=TRUE',[uid]);if(!u)fail(401,'Akun nonaktif');
    const refreshToken=await jwt(c,u,'refresh');
    const session=await first(c,'INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2,to_timestamp($3)) RETURNING id',[uid,await sha(refreshToken),time()+604800]);
    await q(c,'COMMIT');const accessToken=await jwt(c,u,'access',session.id);setAuthCookies(c,accessToken,refreshToken);return c.json({user:{...u,projects:await members(c,uid)}});
  }catch(e){await q(c,'ROLLBACK');throw e;}
});
app.use('/api/*',async(c,next)=>{
  if(['/api/health','/api/status','/api/auth/login','/api/auth/refresh'].includes(c.req.path))return next();
  const h=c.req.header('authorization')||'';const incoming=h.startsWith('Bearer ')?h.slice(7):getCookie(c,'qa_access');if(!incoming)fail(401,'Unauthorized');let claims;
  try{claims=await verify(incoming,c.env.JWT_ACCESS_SECRET,'HS256');}catch{fail(401,'Token tidak valid');}
  if(claims.kind!=='access')fail(401,'Jenis token tidak valid');
  const uid=id(claims.sub);
  // Every bearer/cookie access token must belong to a live, non-revoked server session.
  // Legacy tokens without sid require re-login once after this security upgrade.
  const sid=claims.sid&&/^[1-9]\d*$/.test(String(claims.sid))?id(claims.sid):null;
  if(!sid)fail(401,'Sesi perlu diperbarui: silakan login ulang');
  const active=await first(c,'SELECT id FROM refresh_tokens WHERE id=$1 AND user_id=$2 AND revoked=FALSE AND expires_at>now()',[sid,uid]);
  if(!active||!await first(c,'SELECT id FROM users WHERE id=$1 AND aktif=TRUE',[uid]))fail(401,'Sesi tidak berlaku');
  c.set('uid',uid);c.set('sid',sid);return next();
});
app.get('/api/auth/me',async c=>{const u=await first(c,'SELECT id,email,nama,is_platform_admin FROM users WHERE id=$1',[c.get('uid')]);return c.json({...u,projects:await members(c,u.id)});});
app.post('/api/auth/logout',async c=>{
  const d=await json(c),token=d?.refreshToken||getCookie(c,'qa_refresh');
  // Revoke the access token's backing session immediately, even without refresh cookie.
  await q(c,'UPDATE refresh_tokens SET revoked=TRUE WHERE id=$1 AND user_id=$2',[c.get('sid'),c.get('uid')]);
  if(typeof token==='string')await q(c,'UPDATE refresh_tokens SET revoked=TRUE WHERE user_id=$1 AND token_hash=$2',[c.get('uid'),await sha(token)]);
  clearAuthCookies(c);c.set('pid',null);await audit(c,'AUTH_LOGOUT','user',c.get('uid'));
  return c.json({ok:true});
});
// Session-cookie authenticated WebSocket; existing access-session validation ran above.
app.get('/api/live/projects/:projectId/ws',async c=>{
  const origin=c.req.header('origin');
  let sameOrigin=false;
  try { sameOrigin=!!origin&&new URL(origin).origin===new URL(c.req.url).origin; }catch{}
  if(!sameOrigin)fail(403,'Origin WebSocket ditolak');
  if(c.req.header('upgrade')?.toLowerCase()!=='websocket')return c.text('Upgrade WebSocket diperlukan',426);
  if(!c.env.PROJECT_LIVE) return c.json({error:'Realtime belum dikonfigurasi'},503);
  const pid=await guard(c,'projectId');
  const sessionId=c.req.query('sessionId');
  if(sessionId){
    const sid=id(sessionId);
    if(!await first(c,'SELECT id FROM ulo_sesi WHERE id=$1 AND project_id=$2',[sid,pid]))fail(404,'Sesi bukan milik project');
  }
  const person=await first(c,'SELECT nama FROM users WHERE id=$1',[c.get('uid')]);
  const cookie=getCookie(c,'qa_access')||'';
  let expires=0;
  try{expires=Number((await verify(cookie,c.env.JWT_ACCESS_SECRET,'HS256')).exp||0);}catch{fail(401,'Cookie sesi tidak berlaku');}
  const ns=c.env.PROJECT_LIVE;
  const room=ns.get(ns.idFromName('project:'+pid));
  return room.fetch(new Request('https://internal/connect',{
    headers:{
      Upgrade:'websocket',
      'Sec-WebSocket-Protocol':'qa-live-v1',
      'X-QA-User':String(c.get('uid')),
      'X-QA-Name':String(person?.nama||'Pengguna').slice(0,80),
      'X-QA-Session':sessionId||'',
      'X-QA-Expires':String(expires),
    }
  }));
});
app.get('/api/projects/:projectId/dashboard',async c=>{
  const pid=await guard(c,'projectId');
  return c.json((await q(c,`SELECT s.id,s.status,s.revision,a.nama_singkat,COUNT(i.id)::int AS total,
     COUNT(i.id) FILTER (WHERE i.status='PASS')::int AS lulus,
     COUNT(i.id) FILTER (WHERE i.status='FAIL')::int AS gagal,
     COUNT(i.id) FILTER (WHERE i.status='BELUM')::int AS belum
     FROM ulo_sesi s JOIN aplikasi a ON a.id=s.aplikasi_id LEFT JOIN ulo_item i ON i.sesi_id=s.id
     WHERE s.project_id=$1 GROUP BY s.id,a.nama_singkat ORDER BY s.id DESC`,[pid])).rows);
});
app.get('/api/projects/:projectId/activity',async c=>{
  const pid=await guard(c,'projectId');
  return c.json((await q(c,`SELECT e.id,e.action,e.entity_type,e.entity_id,e.occurred_at,u.nama AS actor
    FROM audit_events e LEFT JOIN users u ON u.id=e.actor_id
    WHERE e.project_id=$1 ORDER BY e.occurred_at DESC,e.id DESC LIMIT 30`,[pid])).rows);
});
const publishLive=async(c,action,sessionId,revision,targetUserId)=>{
  if(!c.env.PROJECT_LIVE)return;
  const pid=Number(c.get('pid'));
  if(!Number.isSafeInteger(pid)||pid<=0)return;
  try {
    const ns=c.env.PROJECT_LIVE;
    const event={type:'change',projectId:pid,sessionId:Number(sessionId)||null,
      action,actorId:Number(c.get('uid')),targetUserId:targetUserId===undefined?undefined:Number(targetUserId),revision:revision===undefined?undefined:Number(revision),at:new Date().toISOString()};
    await ns.get(ns.idFromName('project:'+pid)).fetch(new Request('https://internal/publish',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(event)
    }));
  } catch(e){console.error('qa_live_publish',e?.message||'error');}
};

app.get('/api/projects',async c=>c.json((await q(c,`SELECT p.* FROM projects p JOIN project_members pm ON pm.project_id=p.id WHERE pm.user_id=$1 AND p.aktif=TRUE ORDER BY p.kode`,[c.get('uid')])).rows));
app.post('/api/projects',async c=>{if(!await first(c,'SELECT id FROM users WHERE id=$1 AND is_platform_admin=TRUE AND aktif=TRUE',[c.get('uid')]))fail(403,'Hanya platform admin dapat membuat project');const d=await json(c);if(![d?.kode,d?.nama,d?.instansi].every(isStr))fail(400,'Kode, nama, instansi wajib');await q(c,'BEGIN');try{const p=await first(c,'INSERT INTO projects(kode,nama,instansi,bidang) VALUES($1,$2,$3,$4) RETURNING *',[d.kode.trim().toUpperCase(),d.nama.trim(),d.instansi.trim(),d.bidang||null]);await q(c,"INSERT INTO project_members(user_id,project_id,role) VALUES($1,$2,'ADMIN')",[c.get('uid'),p.id]);c.set('pid',p.id);await audit(c,'PROJECT_CREATED','project',p.id);await q(c,'COMMIT');await publishLive(c,'PROJECT_CREATED');return c.json(p,201);}catch(e){await q(c,'ROLLBACK');throw e;}});
app.get('/api/projects/:projectId',async c=>{const pid=await guard(c,'projectId');return c.json(await first(c,'SELECT * FROM projects WHERE id=$1',[pid]));});
app.patch('/api/projects/:projectId',async c=>{const pid=await guard(c,'projectId',['ADMIN']),d=await json(c),keys=['nama','instansi','bidang'].filter(k=>d?.[k]!==undefined);if(!keys.length)fail(400,'Tidak ada perubahan');if(keys.some(k=>k!=='bidang'&&!isStr(d[k])))fail(400,'Field wajib');const args=[...keys.map(k=>d[k]),pid];const p=await first(c,`UPDATE projects SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE id=$${args.length} RETURNING *`,args);await audit(c,'PROJECT_UPDATED','project',pid);await publishLive(c,'PROJECT_UPDATED');return c.json(p);});
app.delete('/api/projects/:projectId',async c=>{const pid=await guard(c,'projectId',['ADMIN']);await q(c,'UPDATE projects SET aktif=FALSE WHERE id=$1',[pid]);await audit(c,'PROJECT_ARCHIVED','project',pid);await publishLive(c,'PROJECT_ARCHIVED');return c.body(null,204);});
app.get('/api/projects/:projectId/templates',async c=>{const pid=await guard(c,'projectId');return c.json((await q(c,'SELECT id,versi,nama,published,checksum,created_at FROM templates WHERE project_id=$1 ORDER BY created_at DESC',[pid])).rows);});
app.post('/api/projects/:projectId/templates',async c=>{const pid=await guard(c,'projectId',['ADMIN']),d=await json(c);if(![d?.versi,d?.nama,d?.layout_hbs].every(isStr)||!d?.kategori_map||!d?.page_map)fail(400,'Template tidak lengkap');const checksum=await sha(d.layout_hbs+JSON.stringify(d.partials||{}));const t=await first(c,'INSERT INTO templates(project_id,versi,nama,layout_hbs,partials,kategori_map,page_map,checksum) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[pid,d.versi,d.nama,d.layout_hbs,JSON.stringify(d.partials||{}),JSON.stringify(d.kategori_map),JSON.stringify(d.page_map),checksum]);await audit(c,'TEMPLATE_CREATED','template',t.id);await publishLive(c,'TEMPLATE_CREATED');return c.json(t,201);});
app.get('/api/templates/:templateId',async c=>{await guard(c,'templateId');return c.json(await first(c,'SELECT * FROM templates WHERE id=$1',[id(c.req.param('templateId'))]));});
app.patch('/api/templates/:templateId',async c=>{await guard(c,'templateId',['ADMIN']);const tid=id(c.req.param('templateId')),old=await first(c,'SELECT * FROM templates WHERE id=$1',[tid]);if(old.published)fail(409,'Template sudah published');const d=await json(c),keys=['nama','layout_hbs','partials','kategori_map','page_map'].filter(k=>d?.[k]!==undefined);if(!keys.length)return c.json(old);const args=keys.map(k=>['partials','kategori_map','page_map'].includes(k)?JSON.stringify(d[k]):d[k]);args.push(await sha((d.layout_hbs??old.layout_hbs)+JSON.stringify(d.partials??old.partials)),tid);const t=await first(c,`UPDATE templates SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')},checksum=$${keys.length+1} WHERE id=$${keys.length+2} AND published=FALSE RETURNING *`,args);await audit(c,'TEMPLATE_UPDATED','template',tid);await publishLive(c,'TEMPLATE_UPDATED');return c.json(t);});
app.post('/api/templates/:templateId/publish',async c=>{await guard(c,'templateId',['ADMIN']);const tid=id(c.req.param('templateId'));const t=await first(c,'UPDATE templates SET published=TRUE WHERE id=$1 AND published=FALSE RETURNING *',[tid]);if(!t)fail(409,'Template sudah published');await audit(c,'TEMPLATE_PUBLISHED','template',tid);await publishLive(c,'TEMPLATE_PUBLISHED');return c.json(t);});
app.delete('/api/templates/:templateId',async c=>{await guard(c,'templateId',['ADMIN']);const tid=id(c.req.param('templateId'));const t=await first(c,'SELECT published FROM templates WHERE id=$1',[tid]);if(t.published)fail(409,'Template published tidak dapat dihapus');await q(c,'DELETE FROM templates WHERE id=$1',[tid]);await audit(c,'TEMPLATE_DELETED','template',tid);await publishLive(c,'TEMPLATE_DELETED');return c.body(null,204);});
app.get('/api/projects/:projectId/aplikasi',async c=>{const pid=await guard(c,'projectId');return c.json((await q(c,'SELECT * FROM aplikasi WHERE project_id=$1 ORDER BY nama_singkat',[pid])).rows);});
app.post('/api/projects/:projectId/aplikasi',async c=>{const pid=await guard(c,'projectId',canEdit),d=await json(c);if(!isStr(d?.nama_singkat))fail(400,'nama_singkat wajib');const a=await first(c,'INSERT INTO aplikasi(project_id,nama_singkat,nama_panjang,url) VALUES($1,$2,$3,$4) RETURNING *',[pid,d.nama_singkat,d.nama_panjang||null,d.url||null]);await audit(c,'APLIKASI_CREATED','aplikasi',a.id);await publishLive(c,'APLIKASI_CREATED');return c.json(a,201);});
app.get('/api/aplikasi/:aplikasiId/sesi',async c=>{await guard(c,'aplikasiId');return c.json((await q(c,'SELECT * FROM ulo_sesi WHERE aplikasi_id=$1 ORDER BY created_at DESC',[id(c.req.param('aplikasiId'))])).rows);});
app.post('/api/aplikasi/:aplikasiId/sesi',async c=>{
  const pid=await guard(c,'aplikasiId',canEdit),d=await json(c);
  const t=await first(c,'SELECT id FROM templates WHERE id=$1 AND project_id=$2 AND published=TRUE',[id(d?.template_id),pid]);
  if(!t)fail(400,'Template project wajib published');
  const plan=(await q(c,'SELECT no,kategori,kebutuhan,urutan FROM test_plan_items WHERE project_id=$1 ORDER BY urutan',[pid])).rows;
  if(!plan.length)fail(422,'Project belum memiliki test plan kanonis; admin harus mengisi test plan terlebih dahulu');
  const allowed=['hari','tanggal','pukul','tempat','jenis','penguji_nama','penguji_jabatan','penguji_email','penguji_telp','penguji_nip','saksi_nama','saksi_jabatan','saksi_email','saksi_telp','catatan','temuan'];
  const fields=allowed.filter(k=>d[k]!==undefined),values=[pid,id(c.req.param('aplikasiId')),t.id,...fields.map(k=>d[k])];
  await q(c,'BEGIN');
  try{
    const sql='INSERT INTO ulo_sesi(project_id,aplikasi_id,template_id'+(fields.length?','+fields.join(','):'')+') VALUES('+values.map((_,i)=>'$'+(i+1)).join(',')+') RETURNING *';
    const sesi=await first(c,sql,values);
    await q(c,"INSERT INTO ulo_item(sesi_id,no,kategori,kebutuhan,status,urutan) SELECT $1,no,kategori,kebutuhan,'BELUM',urutan FROM test_plan_items WHERE project_id=$2",[sesi.id,pid]);
    c.set('pid',pid);await audit(c,'SESI_CREATED','sesi',sesi.id,{test_case_count:plan.length});
    await q(c,'COMMIT');await publishLive(c,'SESI_CREATED',Number(sesi.id),Number(sesi.revision));return c.json({...sesi,item_count:plan.length},201);
  }catch(e){await q(c,'ROLLBACK');throw e;}
});
app.get('/api/sesi/:sesiId',async c=>{await guard(c,'sesiId');const sid=id(c.req.param('sesiId')),s=await first(c,'SELECT * FROM ulo_sesi WHERE id=$1',[sid]);const items=(await q(c,'SELECT * FROM ulo_item WHERE sesi_id=$1 ORDER BY urutan',[sid])).rows;return c.json({...s,items,ringkasan:{total:items.length,lulus:items.filter(i=>i.status==='PASS').length,gagal:items.filter(i=>i.status==='FAIL').length,belum:items.filter(i=>i.status==='BELUM').length}});});
app.patch('/api/sesi/:sesiId',async c=>{await guard(c,'sesiId',canEdit);const d=await json(c),sid=id(c.req.param('sesiId')),allowed=['hari','tanggal','pukul','tempat','jenis','penguji_nama','penguji_jabatan','penguji_email','penguji_telp','penguji_nip','saksi_nama','saksi_jabatan','saksi_email','saksi_telp','catatan','temuan'],keys=allowed.filter(k=>d?.[k]!==undefined);if(!keys.length)fail(400,'Tidak ada perubahan');const vals=[...keys.map(k=>d[k]),sid],s=await first(c,`UPDATE ulo_sesi SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE id=$${vals.length} AND status='DRAFT' RETURNING *`,vals);if(!s)fail(409,'Sesi tidak dapat diubah setelah FINAL');await audit(c,'SESI_UPDATED','sesi',sid);await publishLive(c,'SESI_UPDATED',sid,Number(s.revision));return c.json(s);});
app.put('/api/sesi/:sesiId/items',async c=>{
  const pid=await guard(c,'sesiId',canEdit),sid=id(c.req.param('sesiId')),d=await json(c),items=d?.items;
  const expected=d?.expected_revision;
  if(!Number.isSafeInteger(expected)||expected<0)fail(428,'expected_revision wajib');
  const plan=(await q(c,'SELECT no,kategori,kebutuhan,urutan FROM test_plan_items WHERE project_id=$1 ORDER BY urutan',[pid])).rows;
  try{assertCanonicalItems(items,plan);}catch(e){fail(422,e.message);}
  await q(c,'BEGIN');
  try{
    const sesi=await first(c,'SELECT status,revision FROM ulo_sesi WHERE id=$1 FOR UPDATE',[sid]);
    if(sesi?.status!=='DRAFT')fail(409,'Hanya sesi DRAFT dapat diubah');
    if(Number(sesi.revision)!==expected)fail(409,'Data sesi telah diubah pengguna lain. Muat ulang sebelum menyimpan.');
    const previous=(await q(c,'SELECT id,no,status,hasil FROM ulo_item WHERE sesi_id=$1 FOR UPDATE',[sid])).rows;
    if(previous.length!==plan.length)fail(409,'Item sesi belum lengkap; butuh rekonsiliasi admin');
    const old=new Map(previous.map(x=>[String(x.no),x]));
    for(const item of items){
      const prior=old.get(String(item.no));
      if(!prior)fail(409,'Test case sesi tidak sesuai katalog');
      if(prior.status==='FAIL'&&item.status==='PASS')fail(409,'Hasil FAIL harus diperbaiki melalui proses retest defect');
      if(prior.status!==item.status||String(prior.hasil||'')!==String(item.hasil||'')){
        await q(c,'UPDATE ulo_item SET status=$1,hasil=$2 WHERE id=$3',[item.status,item.hasil||null,prior.id]);
        await q(c,'INSERT INTO ulo_item_events(project_id,sesi_id,item_no,old_status,new_status,old_hasil,new_hasil,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[pid,sid,item.no,prior.status,item.status,prior.hasil,item.hasil||null,c.get('uid')]);
        if(item.status==='FAIL'&&prior.status!=='FAIL'){
          await q(c,"INSERT INTO ulo_defects(project_id,sesi_id,item_id,title,description,created_by,status) VALUES($1,$2,$3,$4,$5,$6,'OPEN') ON CONFLICT(item_id) DO UPDATE SET status='REOPENED',description=excluded.description,updated_at=now()",[pid,sid,prior.id,'UAT gagal: '+item.no,item.hasil||null,c.get('uid')]);
        }
      }
    }
    const updated=await first(c,'UPDATE ulo_sesi SET revision=revision+1 WHERE id=$1 RETURNING revision',[sid]);
    const revision=Number(updated.revision);
    c.set('pid',pid);await audit(c,'ITEM_RESULTS_UPDATED','sesi',sid,{count:items.length,revision});
    await q(c,'COMMIT');await publishLive(c,'ITEM_RESULTS_UPDATED',sid,revision);
    return c.json({ok:true,count:items.length,revision});
  }catch(e){await q(c,'ROLLBACK');throw e;}
});
app.get('/api/sesi/:sesiId/outputs',async c=>{await guard(c,'sesiId');return c.json((await q(c,'SELECT id,versi,pdf_path,sha256,size_bytes,page_count,generated_at FROM ulo_output WHERE sesi_id=$1 ORDER BY versi DESC',[id(c.req.param('sesiId'))])).rows);});
app.post('/api/sesi/:sesiId/finalize',async c=>{
  const pid=await guard(c,'sesiId',['ADMIN','APPROVER']),sid=id(c.req.param('sesiId'));
  await q(c,'BEGIN');
  try{
    const sesi=await first(c,'SELECT status,revision FROM ulo_sesi WHERE id=$1 FOR UPDATE',[sid]);
    if(sesi?.status!=='DRAFT')fail(409,'Hanya sesi DRAFT dapat difinalisasi');
    const plan=(await q(c,'SELECT no,kategori,kebutuhan,urutan FROM test_plan_items WHERE project_id=$1 ORDER BY urutan',[pid])).rows;
    const items=(await q(c,'SELECT no,kategori,kebutuhan,status,hasil,urutan FROM ulo_item WHERE sesi_id=$1 ORDER BY urutan',[sid])).rows;
    const project=await first(c,'SELECT require_gate_x FROM projects WHERE id=$1',[pid]);
    const defects=(await q(c,"SELECT d.status,d.resolution_note,i.no AS item_no,(SELECT r.status FROM ulo_retests r WHERE r.defect_id=d.id ORDER BY r.id DESC LIMIT 1) AS last_retest FROM ulo_defects d JOIN ulo_item i ON i.id=d.item_id WHERE d.sesi_id=$1",[sid])).rows;
    const check=checkFinalization(items,plan,{requireGateX:project.require_gate_x,defects});
    if(!check.ok)fail(422,check.reason);
    const result=await first(c,"UPDATE ulo_sesi SET status='FINAL',finalized_at=now() WHERE id=$1 RETURNING *",[sid]);
    c.set('pid',pid);await audit(c,'SESI_FINALIZED','sesi',sid,{revision:sesi.revision});
    await q(c,'COMMIT');await publishLive(c,'SESI_FINALIZED',sid,Number(result.revision));return c.json(result);
  }catch(e){await q(c,'ROLLBACK');throw e;}
});
installPdfRoutes(app,{q,first,guard,id,fail,audit});
installWorkflowRoutes(app,{q,first,guard,id,fail,audit,json,publishLive});
export async function onRequest(ctx){return app.fetch(ctx.request,ctx.env,ctx);}
export {app};