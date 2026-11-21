import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(path,import.meta.url),'utf8');
const detail=source('../src/pages/ProjectDetailPage.tsx');
const validate=source('../src/pages/ValidatePage.tsx');

test('project session empty state uses contrast-safe foreground',()=>{
  assert.match(detail, /text-xs text-slate-600">Belum ada sesi/);
  assert.doesNotMatch(detail, /text-slate-400">Belum ada sesi/);
});
test('PDF validation uses contrast-safe feedback and responsive column layout',()=>{
  assert.match(validate, /text-sm text-slate-600">Belum ada hasil/);
  assert.match(validate, /grid-cols-1 lg:grid-cols-2 gap-6/);
});
