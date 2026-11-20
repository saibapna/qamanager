import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {renderSafeHandlebars} from '../functions/api/safe-handlebars.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

test('Cloudflare AST renderer produces five-page canonical ULO document',async()=>{
  const layout=await fs.readFile(path.join(root,'templates/base-layout.hbs'),'utf8');
  const header=await fs.readFile(path.join(root,'templates/partials/header.hbs'),'utf8');
  const data=JSON.parse(await fs.readFile(path.join(root,'data/sample-sirikap.json'),'utf8'));
  const html=renderSafeHandlebars(layout,data,{header});
  assert.equal((html.match(/class="page page-/g)||[]).length,5);
  assert.match(html,/S-APP\.2\.OBJ\.3/);
  assert.match(html,/Ringkasan Hasil ULO/);
  assert.doesNotMatch(html,/\{\{[^}]*\}\}/);
  assert.match(html,/19880511 202521 1 045/);
  assert.match(html,/SIRIKAP/);
});
test('Cloudflare safe parser escapes user test data and rejects executable helpers',()=>{
  assert.equal(renderSafeHandlebars('Hello {{name}}',{name:'<script>alert(1)</script>'}), 'Hello &lt;script&gt;alert(1)&lt;/script&gt;');
  assert.throws(()=>renderSafeHandlebars('{{#someHelper name}}hello{{/someHelper}}',{name:'x'}),/tidak didukung/);
  assert.throws(()=>renderSafeHandlebars('{{> unknown}}',{},{}),/tidak dikenali/);
  assert.equal(renderSafeHandlebars('{{constructor}}',{}),'');
});
