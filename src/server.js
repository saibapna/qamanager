import express from 'express';
import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { authRoutes } from './auth/routes.js';
import { requireAuth, requireProjectRole, ALL_ROLES } from './auth/middleware.js';
import { generateULOPdfForSesi } from './generate.js';
import { TemplateRegistry } from './template-registry.js';
import { mountSwagger } from './swagger.js';
import { computeDiff } from './validate/diff.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPLOAD_DIR = path.resolve(process.env.WORKER_UPLOAD_DIR || path.join(ROOT, 'output'));
const execFileAsync = promisify(execFile);
const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const nonempty = s => typeof s === 'string' && s.trim().length > 0;
const allowedStatuses = new Set(['PASS','FAIL','BELUM']);
const schema = process.env.DB_SCHEMA || 'ulo_uat';
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('DB_SCHEMA tidak valid');

const config = process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
  host:process.env.PGHOST || 'localhost',
  port:Number(process.env.PGPORT || 5432),
  user:process.env.PGUSER || 'ulo',
  password:process.env.PGPASSWORD,
  database:process.env.PGDATABASE || 'ulo_uat'
};
// Supabase transaction pooler works with an app-server connection. Never expose this URL in React.
const db = new pg.Pool({
  ...config,
  ssl: process.env.DB_SSL === 'true' ? {rejectUnauthorized:true} : undefined,
  options:`-c search_path=${schema},public`,
  max:Number(process.env.PGPOOL_MAX || 5),
  idleTimeoutMillis:30000,
  connectionTimeoutMillis:10000
});
db.on('error', e => console.error('Postgres idle connection error:',e.message));
const registry = new TemplateRegistry(db);
await fs.mkdir(UPLOAD_DIR,{recursive:true});

const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'2mb'}));
app.use((req,_res,next)=>{req.db=db;next();});
app.use('/api/auth',rateLimit({windowMs:60_000,limit:10,standardHeaders:'draft-7',legacyHeaders:false}));
app.use('/api',rateLimit({windowMs:60_000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));

async function health(_req,res) {
  try {await db.query('SELECT 1'); res.json({ok:true,db:'up',uptime:process.uptime()});}
  catch {res.status(503).json({ok:false,db:'down'});}
}
app.get('/health',wrap(health));
app.get('/api/health',wrap(health));
app.use('/api/auth',authRoutes(db));
app.use('/api',requireAuth);

const upload = multer({
  dest:path.join(UPLOAD_DIR,'uploads'),
  limits:{fileSize:20*1024*1024,files:1}
});

async function audit(dbq, req, action, entityType, entityId, metadata={}) {
  await dbq.query(`INSERT INTO audit_events(project_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES($1,$2,$3,$4,$5,$6)`,[req.projectId || null,req.user.id,action,entityType,entityId,JSON.stringify(metadata)]);
}
const read = requireProjectRole(...ALL_ROLES);
const edit = requireProjectRole('ADMIN','TESTER');
const admin = requireProjectRole('ADMIN');

// Projects
app.get('/api/projects',wrap(async(req,res)=>{
  const {rows}=await db.query(`SELECT p.* FROM projects p JOIN project_members pm ON pm.project_id=p.id
    WHERE pm.user_id=$1 AND p.aktif=TRUE ORDER BY p.kode`,[req.user.id]);
  res.json(rows);
}));
app.post('/api/projects',wrap(async(req,res)=>{
  const {kode,nama,instansi,bidang}=req.body || {};
  if (![kode,nama,instansi].every(nonempty)) return res.status(400).json({error:'Kode, nama, instansi wajib'});
  const tx=await db.connect();
  try {
    await tx.query('BEGIN');
    const {rows:[project]}=await tx.query(`INSERT INTO projects(kode,nama,instansi,bidang)
      VALUES($1,$2,$3,$4) RETURNING *`,[kode.trim().toUpperCase(),nama.trim(),instansi.trim(),bidang || null]);
    await tx.query(`INSERT INTO project_members(user_id,project_id,role) VALUES($1,$2,'ADMIN')`,[req.user.id,project.id]);
    req.projectId=project.id;
    await audit(tx,req,'PROJECT_CREATED','project',project.id);
    await tx.query('COMMIT');
    res.status(201).json(project);
  }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
}));
app.get('/api/projects/:projectId',read,wrap(async(req,res)=>{
  const {rows:[p]}=await db.query('SELECT * FROM projects WHERE id=$1',[req.projectId]);
  res.json(p);
}));
app.patch('/api/projects/:projectId',admin,wrap(async(req,res)=>{
  const patch=['nama','instansi','bidang'].filter(k=>req.body?.[k]!==undefined);
  if (!patch.length) return res.status(400).json({error:'Tidak ada field untuk diubah'});
  if (patch.some(k=>k!=='bidang'&&!nonempty(req.body[k]))) return res.status(400).json({error:'Nama/instansi wajib terisi'});
  const args=patch.map(k=>req.body[k]); args.push(req.projectId);
  const {rows:[p]}=await db.query(`UPDATE projects SET ${patch.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE id=$${args.length} RETURNING *`,args);
  await audit(db,req,'PROJECT_UPDATED','project',p.id,{fields:patch});
  res.json(p);
}));
// Soft archive to preserve audit/session history.
app.delete('/api/projects/:projectId',admin,wrap(async(req,res)=>{
  await db.query('UPDATE projects SET aktif=FALSE WHERE id=$1',[req.projectId]);
  await audit(db,req,'PROJECT_ARCHIVED','project',req.projectId);
  res.status(204).end();
}));

// Templates
app.get('/api/projects/:projectId/templates',read,wrap(async(req,res)=>{
  const {rows}=await db.query('SELECT id,versi,nama,published,checksum,created_at FROM templates WHERE project_id=$1 ORDER BY created_at DESC',[req.projectId]);
  res.json(rows);
}));
app.post('/api/projects/:projectId/templates',admin,wrap(async(req,res)=>{
  const {versi,nama,layout_hbs,partials={},kategori_map,page_map}=req.body || {};
  if (![versi,nama,layout_hbs].every(nonempty) || !kategori_map || !page_map || typeof kategori_map!=='object'||typeof page_map!=='object') {
    return res.status(400).json({error:'Data template tidak lengkap'});
  }
  const checksum=TemplateRegistry.computeChecksum(layout_hbs,partials);
  const {rows:[t]}=await db.query(`INSERT INTO templates(project_id,versi,nama,layout_hbs,partials,kategori_map,page_map,checksum)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[req.projectId,versi,nama,layout_hbs,partials,kategori_map,page_map,checksum]);
  await audit(db,req,'TEMPLATE_CREATED','template',t.id,{version:versi});
  res.status(201).json(t);
}));
app.get('/api/templates/:templateId',read,wrap(async(req,res)=>{
  const {rows:[t]}=await db.query('SELECT * FROM templates WHERE id=$1',[req.params.templateId]);
  res.json(t);
}));
app.patch('/api/templates/:templateId',admin,wrap(async(req,res)=>{
  const {rows:[current]}=await db.query('SELECT * FROM templates WHERE id=$1',[req.params.templateId]);
  if(current.published)return res.status(409).json({error:'Template published immutable'});
  const allowed=['nama','layout_hbs','partials','kategori_map','page_map'];
  const fields=allowed.filter(k=>req.body?.[k]!==undefined);
  if(!fields.length)return res.json(current);
  const nextLayout=req.body.layout_hbs ?? current.layout_hbs;
  const nextPartials=req.body.partials ?? current.partials;
  const newHash=TemplateRegistry.computeChecksum(nextLayout,nextPartials);
  const values=fields.map(k=>req.body[k]);
  values.push(newHash,req.params.templateId);
  const {rows:[t]}=await db.query(`UPDATE templates SET ${fields.map((k,i)=>`${k}=$${i+1}`).join(',')},checksum=$${fields.length+1}
    WHERE id=$${fields.length+2} AND published=FALSE RETURNING *`,values);
  registry.invalidate(req.projectId);
  await audit(db,req,'TEMPLATE_UPDATED','template',t.id,{fields});
  res.json(t);
}));
app.delete('/api/templates/:templateId',admin,wrap(async(req,res)=>{
  const {rows:[t]}=await db.query('SELECT * FROM templates WHERE id=$1',[req.params.templateId]);
  if(t.published)return res.status(409).json({error:'Template published tidak dapat dihapus'});
  await db.query('DELETE FROM templates WHERE id=$1',[t.id]);
  registry.invalidate(req.projectId);
  await audit(db,req,'TEMPLATE_DELETED','template',t.id);
  res.status(204).end();
}));
app.post('/api/templates/:templateId/publish',admin,wrap(async(req,res)=>{
  const {rows:[t]}=await db.query('UPDATE templates SET published=TRUE WHERE id=$1 AND published=FALSE RETURNING *',[req.params.templateId]);
  if(!t)return res.status(409).json({error:'Template sudah published'});
  registry.invalidate(req.projectId);
  await audit(db,req,'TEMPLATE_PUBLISHED','template',t.id,{version:t.versi});
  res.json(t);
}));
app.post('/api/templates/:templateId/fixtures',admin,upload.single('file'),wrap(async(req,res)=>{
  if (!req.file) return res.status(400).json({error:'File PDF wajib'});
  const buffer=await fs.readFile(req.file.path);
  if(buffer.subarray(0,5).toString()!=='%PDF-'){
    await fs.rm(req.file.path,{force:true});
    return res.status(400).json({error:'Berkas bukan PDF'});
  }
  const filename=`${req.params.templateId}-${crypto.randomUUID()}.pdf`;
  const dst=path.join(UPLOAD_DIR,'fixtures',filename);
  await fs.mkdir(path.dirname(dst),{recursive:true});
  await fs.rename(req.file.path,dst);
  const sha=crypto.createHash('sha256').update(buffer).digest('hex');
  const {rows:[fx]}=await db.query(`INSERT INTO template_fixtures(template_id,nama,pdf_path,sha256)
    VALUES($1,$2,$3,$4) RETURNING *`,[req.params.templateId,req.file.originalname,dst,sha]);
  await audit(db,req,'FIXTURE_UPLOADED','fixture',fx.id);
  res.status(201).json(fx);
}));

// Applications
app.get('/api/projects/:projectId/aplikasi',read,wrap(async(req,res)=>{
  const {rows}=await db.query('SELECT * FROM aplikasi WHERE project_id=$1 ORDER BY nama_singkat',[req.projectId]);
  res.json(rows);
}));
app.post('/api/projects/:projectId/aplikasi',edit,wrap(async(req,res)=>{
  const {nama_singkat,nama_panjang,url}=req.body || {};
  if(!nonempty(nama_singkat))return res.status(400).json({error:'nama_singkat wajib'});
  const {rows:[a]}=await db.query(`INSERT INTO aplikasi(project_id,nama_singkat,nama_panjang,url)
    VALUES($1,$2,$3,$4) RETURNING *`,[req.projectId,nama_singkat,nama_panjang||null,url||null]);
  await audit(db,req,'APLIKASI_CREATED','aplikasi',a.id);
  res.status(201).json(a);
}));

// Sessions
app.get('/api/aplikasi/:aplikasiId/sesi',read,wrap(async(req,res)=>{
  const {rows}=await db.query('SELECT * FROM ulo_sesi WHERE aplikasi_id=$1 ORDER BY created_at DESC',[req.params.aplikasiId]);
  res.json(rows);
}));
app.post('/api/aplikasi/:aplikasiId/sesi',edit,wrap(async(req,res)=>{
  const {template_id, ...fields}=req.body || {};
  const {rows:[t]}=await db.query('SELECT id FROM templates WHERE id=$1 AND project_id=$2 AND published=TRUE',[template_id,req.projectId]);
  if(!t)return res.status(400).json({error:'Template harus published dan berada pada project yang sama'});
  const allowed=['hari','tanggal','pukul','tempat','jenis','penguji_nama','penguji_jabatan','penguji_email','penguji_telp','penguji_nip','saksi_nama','saksi_jabatan','saksi_email','saksi_telp','catatan','temuan'];
  const keys=allowed.filter(k=>fields[k]!==undefined);
  const values=[req.projectId,req.params.aplikasiId,template_id,...keys.map(k=>fields[k])];
  const {rows:[s]}=await db.query(`INSERT INTO ulo_sesi(project_id,aplikasi_id,template_id${keys.length?','+keys.join(','):''})
    VALUES(${values.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,values);
  await audit(db,req,'SESI_CREATED','sesi',s.id);
  res.status(201).json(s);
}));
app.get('/api/sesi/:sesiId',read,wrap(async(req,res)=>{
  const {rows:[s]}=await db.query('SELECT * FROM ulo_sesi WHERE id=$1',[req.params.sesiId]);
  const {rows:items}=await db.query('SELECT * FROM ulo_item WHERE sesi_id=$1 ORDER BY urutan',[req.params.sesiId]);
  res.json({...s,items,ringkasan:{total:items.length,lulus:items.filter(i=>i.status==='PASS').length,
    gagal:items.filter(i=>i.status==='FAIL').length,belum:items.filter(i=>i.status==='BELUM').length}});
}));
app.patch('/api/sesi/:sesiId',edit,wrap(async(req,res)=>{
  const allowed=['hari','tanggal','pukul','tempat','jenis','penguji_nama','penguji_jabatan','penguji_email','penguji_telp','penguji_nip','saksi_nama','saksi_jabatan','saksi_email','saksi_telp','catatan','temuan'];
  const keys=allowed.filter(k=>req.body?.[k]!==undefined);
  if(!keys.length)return res.status(400).json({error:'Field perubahan tidak tersedia'});
  const vals=[...keys.map(k=>req.body[k]),req.params.sesiId];
  const {rows:[s]}=await db.query(`UPDATE ulo_sesi SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')}
    WHERE id=$${vals.length} AND status='DRAFT' RETURNING *`,vals);
  if(!s)return res.status(409).json({error:'Sesi tidak dapat diubah setelah FINAL'});
  await audit(db,req,'SESI_UPDATED','sesi',s.id,{fields:keys});
  res.json(s);
}));
app.put('/api/sesi/:sesiId/items',edit,wrap(async(req,res)=>{
  const items=req.body?.items;
  if(!Array.isArray(items)||!items.length||items.length>1000) return res.status(400).json({error:'items wajib array 1-1000'});
  const ids=new Set(),orders=new Set();
  for(const it of items){
    if(!nonempty(it.no)||!nonempty(it.kategori)||!nonempty(it.kebutuhan)||!allowedStatuses.has(it.status)||
      !Number.isInteger(it.urutan)||it.urutan<1||ids.has(it.no)||orders.has(it.urutan)){
      return res.status(400).json({error:'Item invalid, nomor atau urutan duplikat'});
    }
    ids.add(it.no); orders.add(it.urutan);
  }
  const tx=await db.connect();
  try {
    await tx.query('BEGIN');
    const {rows:[s]}=await tx.query('SELECT status FROM ulo_sesi WHERE id=$1 FOR UPDATE',[req.params.sesiId]);
    if(s.status!=='DRAFT'){await tx.query('ROLLBACK');return res.status(409).json({error:'Hanya sesi DRAFT dapat diubah'});}
    await tx.query('DELETE FROM ulo_item WHERE sesi_id=$1',[req.params.sesiId]);
    for(const it of items){
      await tx.query(`INSERT INTO ulo_item(sesi_id,no,kategori,kebutuhan,hasil,status,urutan)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[req.params.sesiId,it.no,it.kategori,it.kebutuhan,it.hasil??null,it.status,it.urutan]);
    }
    await audit(tx,req,'ITEMS_REPLACED','sesi',req.params.sesiId,{count:items.length});
    await tx.query('COMMIT');
    res.json({ok:true,count:items.length});
  }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
}));
app.get('/api/sesi/:sesiId/outputs',read,wrap(async(req,res)=>{
  const {rows}=await db.query('SELECT id,versi,pdf_path,sha256,size_bytes,page_count,generated_at FROM ulo_output WHERE sesi_id=$1 ORDER BY versi DESC',[req.params.sesiId]);
  res.json(rows);
}));
app.post('/api/sesi/:sesiId/pdf',requireProjectRole('ADMIN','TESTER','APPROVER'),wrap(async(req,res)=>{
  const filename=`ulo-${req.params.sesiId}-${crypto.randomUUID()}.pdf`;
  const outputPath=path.join(UPLOAD_DIR,`project-${req.projectId}`,filename);
  const result=await generateULOPdfForSesi({db,sesiId:Number(req.params.sesiId),outPath:outputPath,registry});
  const tx=await db.connect();
  try {
    await tx.query('BEGIN');
    await tx.query('SELECT id FROM ulo_sesi WHERE id=$1 FOR UPDATE',[req.params.sesiId]);
    const {rows:[latest]}=await tx.query('SELECT COALESCE(MAX(versi),0)+1 AS versi FROM ulo_output WHERE sesi_id=$1',[req.params.sesiId]);
    const {rows:[out]}=await tx.query(`INSERT INTO ulo_output(sesi_id,versi,pdf_path,sha256,size_bytes)
      VALUES($1,$2,$3,$4,$5) RETURNING id,versi`,[req.params.sesiId,latest.versi,outputPath,result.sha256,result.size]);
    await audit(tx,req,'PDF_GENERATED','output',out.id,{version:out.versi,sha256:result.sha256});
    await tx.query('COMMIT');
  }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
  res.set('Content-Type','application/pdf');
  res.set('Content-Disposition',`inline; filename="ulo-${req.params.sesiId}.pdf"`);
  res.set('X-Checksum-SHA256',result.sha256);
  res.send(await fs.readFile(outputPath));
}));
app.post('/api/sesi/:sesiId/finalize',requireProjectRole('ADMIN','APPROVER'),wrap(async(req,res)=>{
  const tx=await db.connect();
  try {
    await tx.query('BEGIN');
    const {rows:[s]}=await tx.query('SELECT * FROM ulo_sesi WHERE id=$1 FOR UPDATE',[req.params.sesiId]);
    if(s.status!=='DRAFT'){await tx.query('ROLLBACK');return res.status(409).json({error:'Hanya DRAFT bisa difinalisasi'});}
    const {rows:items}=await tx.query('SELECT no,status FROM ulo_item WHERE sesi_id=$1',[s.id]);
    if(!items.length||items.some(i=>i.status==='BELUM')){
      await tx.query('ROLLBACK'); return res.status(422).json({error:'Semua item wajib diuji sebelum finalisasi'});
    }
    const gates=['X1','X2','X3','X4','X5'];
    if(items.some(i=>gates.includes(i.no)) && gates.some(no=>items.find(i=>i.no===no)?.status!=='PASS')){
      await tx.query('ROLLBACK');return res.status(422).json({error:'Gate X1-X5 wajib PASS sebelum finalisasi'});
    }
    const {rows:[updated]}=await tx.query("UPDATE ulo_sesi SET status='FINAL' WHERE id=$1 RETURNING *",[s.id]);
    await audit(tx,req,'SESI_FINALIZED','sesi',s.id);
    await tx.query('COMMIT');
    res.json(updated);
  }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
}));

// Validation accepts only PDFs generated for this exact template (no arbitrary filesystem reads).
async function validatePaths(templateId, outputPath) {
  const {rows:[fx]}=await db.query('SELECT pdf_path FROM template_fixtures WHERE template_id=$1 ORDER BY created_at DESC LIMIT 1',[templateId]);
  if(!fx)return {error:'Fixture baseline tidak ada'};
  if(typeof outputPath!=='string')return {error:'outputPath wajib'};
  const {rows:[out]}=await db.query(`SELECT o.pdf_path FROM ulo_output o JOIN ulo_sesi s ON s.id=o.sesi_id
    WHERE s.template_id=$1 AND o.pdf_path=$2`,[templateId,outputPath]);
  if(!out)return {error:'Output belum terdaftar untuk template ini'};
  return {reference:fx.pdf_path,output:out.pdf_path};
}
app.post('/api/templates/:templateId/validate',read,wrap(async(req,res)=>{
  const files=await validatePaths(req.params.templateId,req.body?.outputPath ?? req.body?.output);
  if(files.error)return res.status(400).json({ok:false,error:files.error});
  try {
    const {stdout}=await execFileAsync('python3',[path.join(ROOT,'scripts/validate.py'),files.reference,files.output],
      {cwd:ROOT,timeout:120000,maxBuffer:1024*1024});
    res.json({ok:true,log:stdout});
  }catch(e){res.status(422).json({ok:false,log:e.stdout || e.stderr || e.message});}
}));
app.post('/api/templates/:templateId/diff',read,wrap(async(req,res)=>{
  const files=await validatePaths(req.params.templateId,req.body?.outputPath);
  if(files.error)return res.status(400).json({error:files.error});
  const runId=crypto.randomUUID();
  const workDir=path.join(UPLOAD_DIR,'diff',String(req.params.templateId),runId);
  const result=await computeDiff(files.reference,files.output,workDir);
  const urlFor=p=>{
    const rel=path.relative(workDir,p).split(path.sep).join('/');
    return `/api/diff-file/${req.params.templateId}/${runId}/${rel}`;
  };
  result.pages=result.pages.map(p=>({...p,
    refUrl:p.ref&&urlFor(p.ref),outUrl:p.out&&urlFor(p.out),heatmapUrl:p.heatmap&&urlFor(p.heatmap),
    ref:undefined,out:undefined,heatmap:undefined
  }));
  res.json(result);
}));
app.get('/api/diff-file/:templateId/:runId/:folder/:filename',read,wrap(async(req,res)=>{
  const {templateId,runId,folder,filename}=req.params;
  if(!/^[\da-f-]{36}$/.test(runId)||!['ref','out','diff'].includes(folder)||!/^[\w.-]+\.png$/i.test(filename)){
    return res.status(400).json({error:'Path tidak valid'});
  }
  const file=path.join(UPLOAD_DIR,'diff',templateId,runId,folder,filename);
  res.sendFile(file);
}));

mountSwagger(app);
app.use((err,_req,res,_next)=>{
  console.error(err);
  if(err instanceof multer.MulterError)return res.status(400).json({error:err.code});
  if(err.code==='23505')return res.status(409).json({error:'Data duplikat'});
  if(err.code==='23503'||err.code==='23514')return res.status(400).json({error:'Data melanggar relasi/aturan database'});
  if(err.code==='ENOENT')return res.status(404).json({error:'Berkas tidak ditemukan'});
  res.status(500).json({error:'Kesalahan server'});
});

const port=Number(process.env.PORT||3000);
const listener=app.listen(port,()=>console.log(`ULO/UAT Manager API :${port}`));
process.on('SIGTERM',async()=>{listener.close();await db.end();});
