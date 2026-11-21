import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration=readFileSync(new URL('../../db/migrations/20261122_template_shares_backend_rls.sql',import.meta.url),'utf8');

test('shared template catalog permits only trusted backend SELECT/INSERT/DELETE under RLS',()=>{
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
  assert.match(migration,/REVOKE ALL ON TABLE ulo_uat\.template_shares FROM PUBLIC, anon, authenticated/);
  assert.match(migration,/GRANT SELECT, INSERT, DELETE ON TABLE ulo_uat\.template_shares TO qamanager_web/);
  assert.match(migration,/REVOKE UPDATE ON TABLE ulo_uat\.template_shares FROM qamanager_web/);
  for(const action of ['SELECT','INSERT','DELETE']){
    assert.match(migration,new RegExp('FOR '+action+' TO qamanager_web'));
  }
  assert.doesNotMatch(migration,/TO\s+(anon|authenticated)\s+USING\s*\(\s*true\s*\)/i);
});

test('migration does not rewrite historical evidence or share rows',()=>{
  assert.doesNotMatch(migration,/\b(?:DROP TABLE|TRUNCATE|DELETE FROM|UPDATE ulo_uat\.template_shares)\b/i);
});
