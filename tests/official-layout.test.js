import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import Handlebars from 'handlebars';
import * as cheerio from 'cheerio';

const layout=await fs.readFile('templates/base-layout.hbs','utf8');
const header=await fs.readFile('templates/partials/header.hbs','utf8');
Handlebars.registerPartial('header',header);

for(const [file,expected,kind] of [
  ['data/sample-ba-uat-2page.json',2,'UAT'],
  ['data/sample-ba-ulo-3page.json',3,'ULO'],
  ['data/sample-sirikap.json',5,'ULO'],
]){
  test('official BA '+kind+' '+expected+' pages: header, signature placeholders, statuses and dynamic footer',async()=>{
    const data=JSON.parse(await fs.readFile(file,'utf8'));
    const $=cheerio.load(Handlebars.compile(layout)(data));
    assert.equal($('.page').length,expected);
    assert.equal($('.header-table').length,expected);
    $('.header-table').each((_,table)=>{
      const codes=$(table).text();
      for(const n of ['3','4','5'])assert.match(codes,new RegExp('S-APP\\.2\\.OBJ\\.'+n));
    });
    assert.equal($('.result-table').length,expected-1);
    assert.equal($('.signature-table').length,2);
    if(expected===5) assert.match($('.page-1 .summary-block').text(),new RegExp('Ringkasan Hasil '+kind));
    else assert.doesNotMatch($('.page-1 .summary-block').text(),/Ringkasan Hasil/);
    assert.match($('.page-1 .page-footer').text(),new RegExp('1 dari '+expected+' halaman'));
    const resultCount=$('.result-table tbody tr:not(.section-row)').length;
    assert.equal(resultCount,data.ringkasan.total);
    assert.equal($('.status-pass').length,data.ringkasan.lulus);
    assert.equal($('.status-fail').length,data.ringkasan.gagal);
    assert.equal($('.status-pending').length,data.ringkasan.belum);
    assert.equal($('img[src^="data:"]').length,0,'Do not copy signature images');
    assert.equal($('.header-table').first().text().includes('S-APP.2.OBJ.5'),true);
    assert.equal($('.header-table').first().text().includes('Dinas Komunikasi'),true);
  });
}

test('HTML-escaped official layout content resists injection',()=>{
  const sample={project:{kode_form_1:'1',kode_form_2:'2',kode_form_3:'3'},penerbit:{dinas:'Dinas Komunikasi'},skpd:{nama:'<script>alert(1)</script>'},dokumen:{jenis:'UAT',totalPages:1},pages:[],ringkasan:{total:0,lulus:0,gagal:0,belum:0},sesi:{tanggal:'1'}};
  const html=Handlebars.compile(layout)(sample);
  assert.doesNotMatch(html,/<script>alert/);
  assert.match(html,/&lt;script&gt;/);
});
