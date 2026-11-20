import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const read=path=>fs.readFile(path,'utf8');

test('Supabase bootstrap dibuat tanpa server filesystem access atau akun demo',async()=>{
  const sql=await read('db/supabase-bootstrap.sql');
  assert.match(sql,/CREATE SCHEMA IF NOT EXISTS ulo_uat/);
  assert.match(sql,/ALTER TABLE projects ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql,/pg_read_file\s*\(/i);
  assert.doesNotMatch(sql,/INSERT\s+INTO\s+users\s*\(/i);
  assert.match(sql,/FOREIGN KEY \(template_id, project_id\)/);
  assert.match(sql,/FOREIGN KEY \(aplikasi_id, project_id\)/);
});

test('Checksum template seed sesuai file HBS yang di-render',async()=>{
  const layout=await read('templates/base-layout.hbs');
  const header=await read('templates/partials/header.hbs');
  const expected=crypto.createHash('sha256').update(layout+JSON.stringify({header})).digest('hex');
  const sql=await read('db/seed-templates.sql');
  assert.equal(sql.split(expected).length-1,2);
});
