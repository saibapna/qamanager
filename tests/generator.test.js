import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { PDFDocument } from 'pdf-lib';
import Handlebars from 'handlebars';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'sample-sirikap.json'), 'utf-8'));

describe('JSON Data Integrity', () => {
  test('total item = 71', () => {
    const total = DATA.pages.reduce((a, p) => a + p.rows.filter(r => !r.isSection).length, 0);
    assert.equal(total, 71);
  });
  test('ringkasan konsisten', () => {
    assert.equal(DATA.ringkasan.lulus + DATA.ringkasan.gagal + DATA.ringkasan.belum, DATA.ringkasan.total);
  });
});

describe('HTML Structure', () => {
  let $;
  before(async () => {
    const tpl = await fs.readFile(path.join(ROOT, 'templates', 'base-layout.hbs'), 'utf-8');
    const hdr = await fs.readFile(path.join(ROOT, 'templates', 'partials', 'header.hbs'), 'utf-8');
    Handlebars.registerPartial('header', hdr);
    const html = Handlebars.compile(tpl)(DATA);
    $ = cheerio.load(html);
  });
  test('jumlah .page = 5', () => assert.equal($('.page').length, 5));
  test('halaman hasil mengikuti urutan dokumen resmi 20/22/18/11',()=>{
    assert.deepEqual($('.page-results').map((_,el)=>$(el).find('.result-table tbody tr:not(.section-row)').length).get(),[20,22,18,11]);
  });
  test('header berisi 3 kode form', () => {
    const t = $('.header-table').first().text();
    assert.match(t, /S-APP\.2\.OBJ\.3/);
    assert.match(t, /S-APP\.2\.OBJ\.4/);
    assert.match(t, /S-APP\.2\.OBJ\.5/);
  });
  test('blok pengesahan ada di halaman identitas dan hasil akhir, tanpa gambar tanda tangan', () => {
    assert.equal($('.signature-table').length,2);
    assert.match($('.signature-table').text(), /19880511 202521 1 045/);
    assert.match($('.page-1 .summary-block').text(), /71 item diuji/);
    assert.equal($('.result-table .status-fail').length,13);
    assert.equal($('.result-table .status-pass').length,58);
    assert.doesNotMatch($.html(), /data:image\/(png|jpeg)/);
  });
  test('tidak ada placeholder HBS tersisa', () => {
    assert.doesNotMatch($.html(), /\{\{[^}]+\}\}/);
  });
});
