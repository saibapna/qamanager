import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Hono} from 'hono';
import {PDFDocument} from 'pdf-lib';
import {installPdfRoutes} from '../functions/api/pdf-support.js';

const layout=readFileSync(new URL('../../templates/base-layout.hbs',import.meta.url),'utf8');
const header=readFileSync(new URL('../../templates/partials/header.hbs',import.meta.url),'utf8');
const srcData=JSON.parse(readFileSync(new URL('../../data/sample-ba-uat-2page.json',import.meta.url),'utf8'));
const items=srcData.pages.flatMap(p=>p.rows.filter(row=>!row.isSection))
  .map((row,i)=>({no:row.no,kategori:'A',kebutuhan:row.kebutuhan,
    hasil:row.hasil,status:row.status,urutan:i+1}));
const tpl={
  layout_hbs:layout,partials:{header},kategori_map:{A:'UAT'},
  page_map:{2:{fromOrder:1,toOrder:items.length}},published:true
};
const baseSesi={
  id:14,project_id:1,aplikasi_id:1,template_id:6,
  revision:3,status:'DRAFT',tanggal:'2026-11-18',hari:'Rabu',pukul:'09:00',
  tempat:'Pengujian daring',jenis:'User Acceptance Test (UAT)',
  project_nama:'Proyek Contoh',instansi:'Instansi Contoh',
  nama_singkat:'CONTOH',nama_panjang:'Aplikasi Contoh',url:'https://example.invalid/',
  penguji_nama:'Tester Contoh',saksi_nama:'Saksi Contoh'
};
const pdf=await PDFDocument.create();
pdf.addPage([595.28,841.89]);
const bytes=await pdf.save();

function testApp({changedAfterRender=false}={}){
  const log={queries:[],renders:0,html:'',roleChecks:[]};
  const app=new Hono();
  app.onError((e,c)=>c.json({error:e.message},e.status||500));
  const fail=(status,msg)=>{const e=new Error(msg);e.status=status;throw e};
  const guard=async(c,key,allowed)=>{
    log.roleChecks.push({key,allowed});
    if(c.req.header('Authorization')!=='Bearer permitted') fail(401,'Unauthorized');
    if(c.req.param('sesiId')!=='14') fail(403,'Akses project ditolak');
    return 1;
  };
  const q=async (_c,sql)=>{
    log.queries.push(sql);
    if(sql.includes('FROM ulo_item WHERE sesi_id=$1 ORDER BY urutan'))return {rows:items};
    throw Error('Unexpected SQL query: '+sql);
  };
  const first=async (_c,sql)=>{
    log.queries.push(sql);
    if(sql.includes('SELECT s.*, a.nama_singkat'))return {...baseSesi};
    if(sql.includes('SELECT layout_hbs,partials,kategori_map'))return tpl;
    if(sql.includes('SELECT revision,status FROM ulo_sesi'))return {
      revision:changedAfterRender?baseSesi.revision+1:baseSesi.revision,
      status:baseSesi.status
    };
    if(sql.includes('SELECT count(*)::int AS count FROM ulo_output'))return {count:0};
    throw Error('Unexpected first query: '+sql);
  };
  installPdfRoutes(app,{q,first,guard,id:Number,fail,audit:()=>{throw Error('Preview must not audit')}});
  const env={BROWSER:{quickAction:async(action,{html})=>{
    assert.equal(action,'pdf');
    log.renders++;
    log.html=html;
    return new Response(bytes,{status:200,headers:{'Content-Type':'application/pdf'}});
  }}};
  const request=(url,body='{}',auth='Bearer permitted')=>
    app.request('http://localhost'+url,
      {method:'POST',headers:{'Authorization':auth,'Content-Type':'application/json'},body},env);
  return {request,log};
}

test('preview returns an inline PDF and immutable snapshot metadata, but persists nothing',async()=>{
  const {request,log}=testApp();
  const res=await request('/api/sesi/14/pdf/preview');
  assert.equal(res.status,200,await res.clone().text());
  assert.equal(res.headers.get('Content-Type'),'application/pdf');
  assert.match(res.headers.get('Content-Disposition'),/^inline;/);
  assert.equal(res.headers.get('Cache-Control'),'private, no-store');
  assert.equal(res.headers.get('X-Content-Type-Options'),'nosniff');
  assert.equal(res.headers.get('X-Pdf-Preview-Revision'),'3');
  assert.equal(res.headers.get('X-Pdf-Preview-Status'),'DRAFT');
  assert.equal(res.headers.get('X-Pdf-Preview-Pages'),'1');
  const digest=createHash('sha256').update(log.html).digest('hex');
  assert.equal(res.headers.get('X-Pdf-Preview-Sha256'),digest);
  assert.ok(log.html.includes('18 November 2026'));
  assert.equal(log.renders,1);
  assert.deepEqual(log.roleChecks,[{key:'sesiId',allowed:['ADMIN','TESTER']}]);
  assert.ok(log.queries.every(sql=>/^SELECT /i.test(sql)),'preview cannot write any DB rows');
  assert.equal((await res.arrayBuffer()).byteLength,bytes.length);
});

test('preview must reject anonymous access and unrelated tenant before touching database or renderer',async()=>{
  const {request,log}=testApp();
  assert.equal((await request('/api/sesi/14/pdf/preview','{}','')).status,401);
  assert.equal((await request('/api/sesi/999/pdf/preview')).status,403);
  assert.equal(log.renders,0);
  assert.equal(log.queries.length,0);
});

test('preview rejects stale session if revision changes during Browser Run',async()=>{
  const {request,log}=testApp({changedAfterRender:true});
  const res=await request('/api/sesi/14/pdf/preview');
  assert.equal(res.status,409);
  assert.match((await res.json()).error,/Sesi berubah saat pratinjau/);
  assert.equal(log.renders,1);
  assert.ok(log.queries.every(sql=>/^SELECT /i.test(sql)));
});

test('generate rejects stale/mismatched preview token before rendering or persisting output',async()=>{
  const {request,log}=testApp();
  const res=await request('/api/sesi/14/pdf',JSON.stringify({
    preview_html_sha256:'0'.repeat(64),expected_revision:3,expected_status:'DRAFT'
  }));
  assert.equal(res.status,409);
  assert.match((await res.json()).error,/Buat pratinjau ulang/);
  assert.equal(log.renders,0);
  assert.ok(log.queries.every(sql=>/^SELECT /i.test(sql)));
});

test('UI requires preview before save, blocks unsaved edits and disposes Blob URLs',()=>{
  const ui=readFileSync(new URL('../src/pages/SesiDetailPage.tsx',import.meta.url),'utf8');
  const client=readFileSync(new URL('../src/api/sesi.ts',import.meta.url),'utf8');
  assert.match(ui,/Pratinjau PDF/);
  assert.match(ui,/Generate & Simpan PDF/);
  assert.match(ui,/disabled=\{previewStale \|\| pdfMut\.isPending/);
  assert.match(ui,/disabled=\{previewMut\.isPending \|\| pdfMut\.isPending \|\| !!items/);
  assert.match(ui,/URL\.revokeObjectURL\(preview\.url\)/);
  assert.doesNotMatch(ui,/onClick=\{\(\) => pdfMut\.mutate\(\)\}/);
  assert.match(client,/X-Pdf-Preview/i);
  assert.match(client,/preview_html_sha256/);
});
