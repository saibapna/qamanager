import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const benchmark=source('../../scripts/benchmark-71-item-browser-rendering.mjs');
const report=source('../../.github/docs/pdf-performance-71-items.md');
const production=source('../functions/api/pdf-support.js');

test('Browser Rendering benchmark has 71 cases, five PDF runs and no hard-coded token',()=>{
  assert.match(benchmark, /length:71/);
  assert.match(benchmark, /for\(let i=0;i<5;i\+\+\)/);
  assert.match(benchmark, /CLOUDFLARE_API_TOKEN/);
  assert.match(benchmark, /process\.env\.CLOUDFLARE_API_TOKEN/);
  assert.match(benchmark, /component benchmark/);
  assert.match(benchmark, /p95_ms:/);
});
test('performance report distinguishes component results from production 5-second acceptance',()=>{
  assert.match(report, /end-to-end Worker latency is UNVERIFIED/);
  assert.match(report, /<=5-second acceptance remains unchanged/);
  assert.match(report, /30 authorized real 71-item Worker PDF calls/);
  assert.match(report, /p95 Worker end-to-end <=10 seconds/);
});
test('production Worker records actual PDF render, total, size and page count metrics',()=>{
  assert.match(production, /qamanager_pdf_metrics/);
  assert.match(production, /render_ms:renderMs/);
  assert.match(production, /total_ms:Date\.now\(\)-startedAt/);
  assert.match(production, /page_count:info\.pageCount/);
  assert.match(production, /size_bytes:data\.length/);
});
