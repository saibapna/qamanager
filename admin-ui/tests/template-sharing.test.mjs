import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { installTemplateSharingRoutes } from '../functions/api/template-sharing.js';

function setup() {
  const templates = new Map([
    [6,{id:6,project_id:1,nama:'Form Resmi BA ULO',versi:'1.1.0',layout_hbs:'<html>{{sesi.tanggal}}</html>',
      partials:{header:'BIDANG EGOV'},kategori_map:{A:'DASHBOARD'},
      page_map:{2:{fromOrder:1,toOrder:1}},checksum:'e'.repeat(64),published:true}],
    [8,{id:8,project_id:1,nama:'Draft belum diterbitkan',versi:'2.0.0',
      layout_hbs:'<html/>',partials:{},kategori_map:{},page_map:{},
      checksum:'b'.repeat(64),published:false}]
  ]);
  const shares = new Map();
  const audits = [];
  const logs = [];
  let nextId = 15;
  const fail=(status,msg)=>{const e=new Error(msg);e.status=status;throw e};
  const app=new Hono();
  app.onError((e,c)=>c.json({error:e.message},e.status||500));
  const guard=async(c,key,roles=['ADMIN','TESTER','WITNESS','APPROVER','AUDITOR'])=>{
    if(c.req.header('authorization')!=='Bearer synthetic')fail(401,'Unauthorized');
    const resource=Number(c.req.param(key));
    const projectId=key==='projectId'?resource:templates.get(resource)?.project_id;
    if(!projectId)fail(404,'Resource tidak ditemukan');
    const assigned=(c.req.header('x-projects')||'1,2').split(',').map(Number);
    const role=c.req.header('x-role')||'ADMIN';
    if(!assigned.includes(projectId)||!roles.includes(role))fail(403,'Akses project ditolak');
    c.set('pid',projectId);c.set('uid',42);
    return projectId;
  };
  const q=async (_c,sql,params)=>{
    logs.push({sql,params});
    if(sql.includes('FROM template_shares sh')&&sql.includes('ORDER BY sh.shared_at DESC')) {
      const projectId=params[0];
      return {rows:Array.from(shares.values()).map(sh=>templates.get(sh.template_id))
        .filter(t=>t && t.published && t.project_id!==projectId)
        .map(t=>({
          id:t.id,nama:t.nama,versi:t.versi,checksum:t.checksum,created_at:'2026-11-21T00:00:00Z',
          source_project_code:'SOURCE',source_project_name:'Source project',shared_at:'2026-11-21T00:00:00Z'
        }))};
    }
    throw Error('Unexpected SQL: '+sql);
  };
  const first=async (c,sql,params)=>{
    logs.push({sql,params});
    if(sql.startsWith('SELECT template_id,shared_at FROM template_shares')){
      return shares.get(params[0])||undefined;
    }
    if(sql.startsWith('SELECT t.id FROM templates t JOIN projects p')){
      const t=templates.get(params[0]);
      return t?.project_id===params[1] && t.published ? {id:t.id}:undefined;
    }
    if(sql.startsWith('INSERT INTO template_shares')){
      const [id,project_id,shared_by]=params;
      if(shares.has(id))return undefined;
      const row={template_id:id,project_id,shared_by,shared_at:'2026-11-21T00:00:00Z'};
      shares.set(id,row);
      return row;
    }
    if(sql.startsWith('DELETE FROM template_shares')){
      const sh=shares.get(params[0]);
      if(sh?.project_id!==params[1])return undefined;
      shares.delete(params[0]);
      return sh;
    }
    if(sql.includes('FOR SHARE OF sh,t')) {
      const [id,targetId]=params;
      const source=templates.get(id);
      return shares.has(id) && source?.published && source.project_id!==targetId ? {...source}:undefined;
    }
    if(sql.startsWith('INSERT INTO templates(')){
      const [project_id,versi,nama,layout_hbs,partials,kategori_map,page_map,checksum]=params;
      if(Array.from(templates.values()).some(t=>t.project_id===project_id&&t.versi===versi)){
        const err=new Error('Data duplikat');err.status=409;throw err;
      }
      const t={id:nextId++,project_id,versi,nama,layout_hbs,
        partials:JSON.parse(partials),kategori_map:JSON.parse(kategori_map),
        page_map:JSON.parse(page_map),checksum,published:false};
      templates.set(t.id,t);
      return t;
    }
    throw Error('Unexpected query: '+sql);
  };
  const audit=async(_c,action,kind,entity,meta)=>{audits.push({action,kind,entity,meta})};
  installTemplateSharingRoutes(app,{
    q,first,guard,id:Number,fail,audit,atomic:async(_c,fn)=>fn(),
    publishLive:async()=>{},json:async c=>c.req.json().catch(()=>fail(400,'JSON invalid'))
  });
  const send=(method,path,payload={},headers={})=>app.request('http://test.local'+path,{
    method,headers:{Authorization:'Bearer synthetic','content-type':'application/json',...headers},
    ...(method==='POST'?{body:JSON.stringify(payload)}:{})
  });
  return {send,templates,shares,audits,logs};
}

test('sharing is opt-in: catalog hides unpublished, unshared and source-owned templates',async()=>{
  const x=setup();
  assert.deepEqual(await (await x.send('GET','/api/projects/2/shared-templates')).json(),[]);
  assert.equal((await x.send('POST','/api/templates/8/share')).status,409);
  assert.equal((await x.send('POST','/api/templates/6/share')).status,200);
  const status=await (await x.send('GET','/api/templates/6/share')).json();
  assert.equal(status.shared,true);
  const list=await (await x.send('GET','/api/projects/2/shared-templates')).json();
  assert.equal(list.length,1);
  assert.equal(list[0].source_project_code,'SOURCE');
  assert.equal(list[0].id,6);
  assert.equal('layout_hbs' in list[0],false,'catalog must not leak private content');
  assert.deepEqual(await (await x.send('GET','/api/projects/1/shared-templates')).json(),[]);
  assert.ok(x.audits.some(a=>a.action==='TEMPLATE_SHARED'));
});

test('target ADMIN imports an independent unpublished version with audit and no personal files',async()=>{
  const x=setup();
  await x.send('POST','/api/templates/6/share');
  const res=await x.send('POST','/api/projects/2/templates/import',{source_template_id:6,versi:'2.0.0'});
  assert.equal(res.status,201,await res.clone().text());
  const out=await res.json();
  assert.equal(out.published,false);
  assert.equal(out.project_id,2);
  assert.equal(out.versi,'2.0.0');
  assert.equal(out.checksum,x.templates.get(6).checksum);
  assert.equal(x.templates.get(out.id).layout_hbs,x.templates.get(6).layout_hbs);
  x.templates.get(out.id).layout_hbs='changed locally';
  assert.notEqual(x.templates.get(6).layout_hbs,x.templates.get(out.id).layout_hbs);
  assert.equal(x.audits.find(a=>a.action==='TEMPLATE_IMPORTED')?.meta?.fixtures_copied,false);
  assert.ok(x.logs.every(x=>!/(ulo_item|ulo_sesi|ulo_evidence|template_fixtures|ulo_output)/.test(x.sql)),'no UAT/fixture access');
  assert.equal((await x.send('POST','/api/projects/2/templates/import',{source_template_id:6,versi:'2.0.0'})).status,409);
});

test('unshare removes availability but does not delete existing imported copies',async()=>{
  const x=setup();await x.send('POST','/api/templates/6/share');
  const clone=await (await x.send('POST','/api/projects/2/templates/import',{source_template_id:6,versi:'s6'})).json();
  assert.equal((await x.send('DELETE','/api/templates/6/share')).status,200);
  assert.deepEqual(await (await x.send('GET','/api/projects/2/shared-templates')).json(),[]);
  assert.equal((await x.send('POST','/api/projects/2/templates/import',{source_template_id:6,versi:'s7'})).status,404);
  assert.ok(x.templates.has(clone.id),'previously imported copy remains untouched');
  assert.ok(x.audits.some(a=>a.action==='TEMPLATE_UNSHARED'));
});

test('cross-project membership and ADMIN role are required for publish, browsing and import',async()=>{
  const x=setup();
  assert.equal((await x.send('POST','/api/templates/6/share',{}, {'x-role':'TESTER'})).status,403);
  assert.equal((await x.send('GET','/api/projects/2/shared-templates',{}, {'x-role':'AUDITOR'})).status,403);
  assert.equal((await x.send('POST','/api/templates/6/share',{}, {authorization:''})).status,401);
  assert.equal((await x.send('POST','/api/templates/6/share',{}, {'x-projects':'2'})).status,403);
  await x.send('POST','/api/templates/6/share');
  assert.equal((await x.send('POST','/api/projects/2/templates/import',{source_template_id:6,versi:'x'},{'x-role':'TESTER'})).status,403);
  assert.equal((await x.send('POST','/api/projects/2/templates/import',{source_template_id:6,versi:'x'},{'x-projects':'1'})).status,403);
  assert.equal((await x.send('POST','/api/projects/1/templates/import',{source_template_id:6,versi:'x'})).status,404);
  assert.equal((await x.send('POST','/api/projects/2/templates/import',{source_template_id:8,versi:'x'})).status,404);
  assert.equal((await x.send('POST','/api/projects/2/templates/import',{source_template_id:6,versi:'not valid version'})).status,400);
});

test('migration is private, enforces source publication and never modifies old templates',()=>{
  const sql=readFileSync(new URL('../../db/migrations/20261121_shared_template_library.sql',import.meta.url),'utf8');
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON TABLE ulo_uat\.template_shares FROM anon, authenticated/);
  assert.match(sql,/t\.published = TRUE/);
  assert.match(sql,/p\.aktif = TRUE/);
  assert.doesNotMatch(sql,/UPDATE\s+ulo_uat\.templates|DELETE\s+FROM\s+ulo_uat\.templates/i);
  const ui=readFileSync(new URL('../src/pages/ProjectDetailPage.tsx',import.meta.url),'utf8');
  assert.match(ui,/Katalog Template Bersama/);
  assert.match(ui,/Salin sebagai DRAFT/);
  const edit=readFileSync(new URL('../src/pages/TemplateEditorPage.tsx',import.meta.url),'utf8');
  assert.match(edit,/Bagikan Template/);
  assert.match(edit,/Hentikan Berbagi/);
});
