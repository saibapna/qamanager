import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../../db/migrations/20261121_published_template_immutability.sql',import.meta.url),'utf8');
const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');

test('published templates are immutable at the database write boundary',()=>{
  assert.match(migration,/BEFORE UPDATE OR DELETE ON ulo_uat\\.templates/);
  assert.match(migration,/IF OLD\\.published AND NEW IS DISTINCT FROM OLD/);
  assert.match(migration,/IF OLD\\.published THEN/);
  assert.match(migration,/USING ERRCODE = '23514'/);
  assert.match(migration,/SECURITY INVOKER/);
  assert.match(migration,/REVOKE ALL ON FUNCTION .* FROM PUBLIC/);
});

test('public API still refuses to edit or delete published templates',()=>{
  assert.match(api,/if\\(old\\.published\\)fail\\(409/);
  assert.match(api,/if\\(t\\.published\\)fail\\(409/);
  assert.match(api,/published=FALSE RETURNING/);
});
