import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  formatDateIndonesia, formatHariTanggal, formatPukulWib,
  formatTimestampWib, weekdayMismatch
} from '../../src/utils/indonesian-dates.js';

test('BA import dates are shown consistently without changing original date values', () => {
  assert.equal(formatDateIndonesia('2026-09-20'), '20 September 2026');
  assert.equal(formatDateIndonesia('2026-04-15'), '15 April 2026');
  assert.equal(formatHariTanggal('2026-11-18'), 'Rabu, 18 November 2026');
  assert.equal(formatPukulWib('11.00'), '11.00 WIB');
  assert.equal(weekdayMismatch('Selasa', '2026-09-20'), true);
  assert.equal(weekdayMismatch('Jum’at', '2026-04-15'), true);
  assert.equal(weekdayMismatch('Rabu', '2026-11-18'), false);
});

test('visible timestamps use an explicit WIB zone', () => {
  assert.equal(formatTimestampWib('2026-11-21T11:41:49Z'), '21 November 2026, 18.41 WIB');
  assert.equal(formatTimestampWib('2026-11-21T18:41:49+07:00'), '21 November 2026, 18.41 WIB');
});

test('PDF runtime formats date and hour before binding to official Handlebars layout', () => {
  const worker=readFileSync(new URL('../functions/api/pdf-support.js',import.meta.url),'utf8');
  const cli=readFileSync(new URL('../../src/generate.js',import.meta.url),'utf8');
  for (const source of [worker,cli]) {
    assert.match(source,/tanggal: formatDateIndonesia\(sesi\.tanggal\)/);
    assert.match(source,/pukul: formatPukulWib\(sesi\.pukul\)/);
    assert.match(source,/weekdayMismatch\(sesi\.hari, sesi\.tanggal\)/);
    assert.match(source,/hari: sesi\.hari \|\| weekdayIndonesia\(sesi\.tanggal\)/);
  }
});

test('UI reports source/calendar conflicts, formats timestamps consistently', () => {
  const detail=readFileSync(new URL('../src/pages/SesiDetailPage.tsx',import.meta.url),'utf8');
  assert.match(detail,/Tanggal pengujian/);
  assert.match(detail,/formatDateIndonesia\(sesi\.tanggal\)/);
  assert.match(detail,/weekdayMismatch\(sesi\.hari,sesi\.tanggal\)/);
  assert.match(detail,/tidak diubah otomatis/);
  const list=readFileSync(new URL('../src/pages/ProjectDetailPage.tsx',import.meta.url),'utf8');
  assert.match(list,/formatDateIndonesia\(s\.tanggal\)/);
  for (const path of [
    '../src/components/UatWorkflowPanel.tsx',
    '../src/components/ProjectLivePanel.tsx',
    '../src/pages/ProjectOpsPage.tsx'
  ]) {
    const source=readFileSync(new URL(path,import.meta.url),'utf8');
    assert.match(source,/formatTimestampWib/);
    assert.doesNotMatch(source,/toLocaleString\('id-ID'\)/);
  }
});
