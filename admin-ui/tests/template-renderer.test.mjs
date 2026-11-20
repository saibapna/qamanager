import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderSafeTemplate } from '../functions/api/template-renderer.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const template = readFileSync(ROOT + 'templates/base-layout.hbs', 'utf8');
const header = readFileSync(ROOT + 'templates/partials/header.hbs', 'utf8');
const data = JSON.parse(readFileSync(ROOT + 'data/sample-sirikap.json', 'utf8'));

test('Cloudflare-safe UAT layout renders five physical pages without eval', () => {
  const output = renderSafeTemplate(template, data, { header });
  assert.equal((output.match(/class="page page-\d"/g) || []).length, 5);
  assert.match(output, /S-APP\.2\.OBJ\.3/);
  assert.match(output, /NIP\./);
  assert.doesNotMatch(output, /\{\{[^}]*\}\}/);
  assert.match(output, /page page-5/);
  assert.ok(output.length > 10000);
});

test('XSS-sensitive values are escaped rather than executed', () => {
  const output = renderSafeTemplate('<p>{{value}}</p>', { value: '<script>alert("x")</script>&' });
  assert.equal(output, '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;</p>');
});

test('unsupported helpers and raw expressions fail closed', () => {
  assert.throws(() => renderSafeTemplate('<h1>{{{unsafe}}}</h1>', { unsafe: '<b>bad</b>' }), /tidak diperbolehkan/);
  assert.throws(() => renderSafeTemplate('{{#with obj}}x{{/with}}', {obj: {}}), /tidak didukung/);
  assert.throws(() => renderSafeTemplate('{{> missing}}', {}), /partial tidak ditemukan/);
});