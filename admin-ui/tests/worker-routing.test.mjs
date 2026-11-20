import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const workerPath = fileURLToPath(new URL('../worker/index.ts', import.meta.url));
const source = readFileSync(workerPath, 'utf8')
  .replace(/^import .*;\s*$/gm, '')
  .replace('export default {', 'const worker = {');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

const mockAssets = {
  '/index.html': btoa('<!doctype html><html lang="en"></html>'),
  '/assets/app.js': btoa('console.log("loaded")'),
};
const worker = runInNewContext(compiled + '\nworker;', {
  assets: mockAssets,
  app: { fetch: () => new Response('API', { status: 202 }) },
  Headers, Response, URL, Uint8Array, atob,
});

test('deep-link refresh serves HTML rather than a download', async () => {
  for (const route of ['/projects', '/projects/123', '/login', '/validate']) {
    const response = await worker.fetch(new Request('https://example.com' + route), {}, {});
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type'), /^text\/html\b/, route);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(await response.text(), /^<!doctype html>/i);
  }
});

test('static files keep MIME type and immutable cache policy', async () => {
  const response = await worker.fetch(new Request('https://example.com/assets/app.js'), {}, {});
  assert.match(response.headers.get('content-type'), /^text\/javascript\b/);
  assert.match(response.headers.get('cache-control'), /immutable/);
  assert.equal(await response.text(), 'console.log("loaded")');
});

test('API requests never fall back to HTML', async () => {
  const response = await worker.fetch(new Request('https://example.com/api/status'), {}, {});
  assert.equal(response.status, 202);
  assert.equal(await response.text(), 'API');
});

test('HEAD deep links return HTML headers with no body', async () => {
  const response = await worker.fetch(new Request('https://example.com/projects', { method: 'HEAD' }), {}, {});
  assert.match(response.headers.get('content-type'), /^text\/html\b/);
  assert.equal(await response.text(), '');
});

test('missing static assets return 404, not SPA HTML', async () => {
  const response = await worker.fetch(new Request('https://example.com/assets/missing.js'), {}, {});
  assert.equal(response.status, 404);
});
