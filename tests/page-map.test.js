import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { paginateItems } from '../src/layout/page-map.js';

for (const project of ['sirikap','simpeg']) {
  test(`${project}: 71 item sekali saja dalam 4 halaman hasil`, async () => {
    const data = JSON.parse(await fs.readFile(`data/sample-${project}.json`, 'utf8'));
    const items = data.pages.flatMap(p => p.rows.filter(r => !r.isSection));
    assert.equal(items.length, 71);
    assert.equal(new Set(items.map(r => r.no)).size, 71);
    const total = data.ringkasan.lulus + data.ringkasan.gagal + data.ringkasan.belum;
    assert.equal(total, 71);
    assert.equal(data.pages.length, 4);
    assert.equal(data.pages.every(p => p.rows.filter(r => !r.isSection).length <= 18), true);
  });
}
test('page-map menolak duplikasi', () => {
  assert.throws(() => paginateItems([{no:'A1',kategori:'A',urutan:1}], {
    2:{fromOrder:1,toOrder:1}, 3:{fromOrder:1,toOrder:1}
  }), /lebih dari sekali/);
});
test('page-map menolak item yang hilang', () => {
  assert.throws(() => paginateItems([{no:'A1',kategori:'A',urutan:1}], {2:{fromOrder:2,toOrder:5}}), /tidak mencakup/);
});
