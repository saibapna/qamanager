import { test } from 'node:test';
import assert from 'node:assert/strict';

test('project berbeda = template berbeda', () => {
  const tplA = { kategori: { A: 'AUTENTIKASI' }, pages: [2, 3, 4] };
  const tplB = { kategori: { A: 'AKSES & DASHBOARD' }, pages: [2, 3, 4, 5] };
  assert.notEqual(tplA.kategori.A, tplB.kategori.A);
  assert.equal(tplB.pages.length, 4);
  assert.equal(tplA.pages.length, 3);
});
