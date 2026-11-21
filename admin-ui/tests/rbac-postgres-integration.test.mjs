import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { sign } from 'hono/jwt';
import { app } from '../functions/api/[[path]].js';
import { hashCloudflarePassword } from '../functions/api/workflow-core.js';

// This suite MUST run against the ephemeral GitHub Actions PostgreSQL service.
// It deliberately rejects cloud endpoints, production Supabase, and arbitrary DBs.
const databaseUrl = process.env.QA_INTEGRATION_DATABASE_URL;
const accessSecret = 'test-only-qa-rbac-access-secret-not-a-production-key';
const refreshSecret = 'test-only-qa-rbac-refresh-secret-not-a-production-key';
const environment = {
  HYPERDRIVE: { connectionString: databaseUrl },
  JWT_ACCESS_SECRET: accessSecret,
  JWT_REFRESH_SECRET: refreshSecret,
};
const now = () => Math.floor(Date.now() / 1000);
const access = (uid, sid, expiration = now() + 300) => sign({
  sub: String(uid), sid: String(sid), kind: 'access', iat: now(), exp: expiration,
}, accessSecret, 'HS256');
const send = (method, path, token, payload, extras = {}) => {
  const headers = { ...extras };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  return app.fetch(new Request('https://qamanager-integration.invalid' + path, {
    method, headers, body: payload === undefined ? undefined : JSON.stringify(payload),
  }), environment);
};

test('P0.09 DB-backed Hono cross-project authorization, nested IDs, session revocation', {
  skip: !databaseUrl && 'QA_INTEGRATION_DATABASE_URL absent (ephemeral PostgreSQL job only)',
}, async t => {
  const target = new URL(databaseUrl);
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'Refusing remote database');
  assert.equal(target.pathname, '/qa_rbac_ci', 'Refusing non-ephemeral database');
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    const ddl = [
      'CREATE SCHEMA ulo_uat',
      'CREATE TABLE ulo_uat.projects (id bigint PRIMARY KEY, kode text, nama text, instansi text, aktif boolean, require_gate_x boolean)',
      'CREATE TABLE ulo_uat.users (id bigint PRIMARY KEY, email text, nama text, password_hash text, aktif boolean, is_platform_admin boolean)',
      'CREATE TABLE ulo_uat.project_members (user_id bigint, project_id bigint, role text)',
      'CREATE TABLE ulo_uat.refresh_tokens (id bigserial PRIMARY KEY, user_id bigint, token_hash text UNIQUE, revoked boolean DEFAULT false, expires_at timestamptz)',
      'CREATE TABLE ulo_uat.templates (id bigint PRIMARY KEY, project_id bigint, published boolean, nama text, versi text)',
      'CREATE TABLE ulo_uat.aplikasi (id bigint PRIMARY KEY, project_id bigint, nama_singkat text)',
      'CREATE TABLE ulo_uat.ulo_sesi (id bigint PRIMARY KEY, project_id bigint, aplikasi_id bigint, template_id bigint, status text, revision int, finalized_at timestamptz)',
      'CREATE TABLE ulo_uat.test_plan_items (project_id bigint, no text, kategori text, kebutuhan text, urutan int)',
      'CREATE TABLE ulo_uat.ulo_item (id bigint PRIMARY KEY, sesi_id bigint, no text, kategori text, kebutuhan text, hasil text, status text, urutan int)',
      'CREATE TABLE ulo_uat.ulo_defects (id bigint PRIMARY KEY, project_id bigint, sesi_id bigint, item_id bigint, status text, resolution_note text)',
      'CREATE TABLE ulo_uat.ulo_retests (id bigint PRIMARY KEY, defect_id bigint, status text)',
      'CREATE TABLE ulo_uat.ulo_evidence (id bigint PRIMARY KEY, project_id bigint, sesi_id bigint, item_id bigint, filename text, mime text, byte_size bigint, sha256 text, data bytea, storage_key text, deleted_at timestamptz, uploaded_by bigint, created_at timestamptz)',
      'CREATE TABLE ulo_uat.template_fixtures (id bigint PRIMARY KEY, template_id bigint, nama text, pdf_path text, sha256 text, pdf_data bytea, storage_key text, size_bytes bigint, page_count int, created_at timestamptz)',
      'CREATE TABLE ulo_uat.ulo_output (id bigint PRIMARY KEY, sesi_id bigint, versi int, pdf_path text, sha256 text, pdf_data bytea, storage_key text, size_bytes bigint, page_count int, generated_at timestamptz)',
      'CREATE TABLE ulo_uat.audit_events (id bigserial PRIMARY KEY, project_id bigint, actor_id bigint, action text, entity_type text, entity_id bigint, metadata jsonb, occurred_at timestamptz DEFAULT now())',
      'CREATE TABLE ulo_uat.auth_attempts (key_hash text PRIMARY KEY, attempts int, window_started_at timestamptz, updated_at timestamptz)',
    ].join(';\n') + ';';
    await db.query(ddl);
    for (const p of [[1, 'A'], [2, 'B']]) {
      await db.query('INSERT INTO ulo_uat.projects VALUES($1,$2,$2,$2,true,false)', p);
    }
    const password = 'only-for-isolated-integration-run-2026';
    const hash = hashCloudflarePassword(password);
    for (const [uid, projectId, role] of [
      [101, 1, 'ADMIN'], [102, 2, 'ADMIN'], [103, 1, 'AUDITOR'],
      [104, 1, 'TESTER'], [105, 1, 'APPROVER'],
    ]) {
      await db.query('INSERT INTO ulo_uat.users VALUES($1,$2,$3,$4,true,false)',
        [uid, 'user' + uid + '@integration.invalid', 'User ' + uid, hash]);
      await db.query('INSERT INTO ulo_uat.project_members VALUES($1,$2,$3)', [uid, projectId, role]);
      await db.query('INSERT INTO ulo_uat.refresh_tokens(id,user_id,token_hash,revoked,expires_at) VALUES($1,$2,$3,false,now()+interval \'1 hour\')',
        [uid + 1900, uid, 'test-' + uid]);
    }
    await db.query('INSERT INTO ulo_uat.refresh_tokens(id,user_id,token_hash,revoked,expires_at) VALUES(2999,101,\'revoked-token\',true,now()+interval \'1 hour\')');
    for (const [pid, template, application, session, item, evidence, fixture, output] of [
      [1,301,401,501,601,701,801,901],
      [2,302,402,502,602,702,802,902],
    ]) {
      await db.query('INSERT INTO ulo_uat.templates VALUES($1,$2,true,$3,$3)', [template,pid,'Template ' + pid]);
      await db.query('INSERT INTO ulo_uat.aplikasi VALUES($1,$2,$3)', [application,pid,'App ' + pid]);
      await db.query('INSERT INTO ulo_uat.ulo_sesi VALUES($1,$2,$3,$4,\'DRAFT\',1,NULL)', [session,pid,application,template]);
      await db.query('INSERT INTO ulo_uat.test_plan_items VALUES($1,\'A1\',\'A\',\'Login\',1)', [pid]);
      await db.query('INSERT INTO ulo_uat.ulo_item VALUES($1,$2,\'A1\',\'A\',\'Login\',NULL,\'BELUM\',1)', [item,session]);
      const bytes=Buffer.from('%PDF-private-project-' + pid);
      await db.query('INSERT INTO ulo_uat.ulo_evidence VALUES($1,$2,$3,$4,$5,\'application/pdf\',$6,$7,$8,NULL,NULL,$9,now())',
        [evidence,pid,session,item,'private-' + pid + '.pdf',bytes.length,'a'.repeat(64),bytes,101]);
      await db.query('INSERT INTO ulo_uat.template_fixtures VALUES($1,$2,$3,$3,$4,$5,NULL,$6,1,now())',
        [fixture,template,'fixture-' + pid + '.pdf','b'.repeat(64),bytes,bytes.length]);
      await db.query('INSERT INTO ulo_uat.ulo_output VALUES($1,$2,1,$3,$4,$5,NULL,$6,1,now())',
        [output,session,'output-' + pid + '.pdf','c'.repeat(64),bytes,bytes.length]);
    }
    const admin = await access(101, 2001);
    const other = await access(102, 2002);
    const auditor = await access(103, 2003);
    const tester = await access(104, 2004);
    const revoked = await access(101, 2999);

    await t.test('anonymous and revoked/expired sessions cannot access any project', async () => {
      assert.equal((await send('GET','/api/projects/1')).status,401);
      assert.equal((await send('GET','/api/projects/1',revoked)).status,401);
      assert.equal((await send('GET','/api/projects/1',await access(101,2001,now()-30))).status,401);
    });
    await t.test('cross-project project, template, session and private file routes deny IDOR', async () => {
      for(const path of [
        '/api/projects/2',
        '/api/projects/2/storage-usage',
        '/api/templates/302/fixtures',
        '/api/templates/302/fixtures/802/download',
        '/api/sesi/502',
        '/api/sesi/502/outputs/902/download',
        '/api/sesi/502/items/602/evidence/702/download',
        '/api/sesi/502/defects',
      ]) assert.equal((await send('GET',path,admin)).status,403, path);
      assert.equal((await send('GET','/api/projects/1',other)).status,403);
    });
    await t.test('nested ID swaps inside an authorized project return 404, never foreign bytes', async () => {
      for(const path of [
        '/api/sesi/501/items/602/evidence',
        '/api/sesi/501/items/601/evidence/702/download',
        '/api/templates/301/fixtures/802/download',
        '/api/sesi/501/outputs/902/download',
      ]) assert.equal((await send('GET',path,admin)).status,404,path);
    });
    await t.test('legitimate same-project evidence, fixture and PDF remain downloadable', async () => {
      for(const path of [
        '/api/sesi/501/items/601/evidence/701/download',
        '/api/templates/301/fixtures/801/download',
        '/api/sesi/501/outputs/901/download',
      ]) {
        const res=await send('GET',path,admin);
        assert.equal(res.status,200,path);
        assert.equal(await res.text(),'%PDF-private-project-1',path);
        assert.match(res.headers.get('cache-control')||'',/no-store/);
      }
    });
    await t.test('AUDITOR read-only; TESTER cannot finalize or modify project members', async () => {
      assert.equal((await send('GET','/api/projects/1',auditor)).status,200);
      assert.equal((await send('GET','/api/sesi/501/items/601/evidence/701/download',auditor)).status,200);
      assert.equal((await send('DELETE','/api/sesi/501/items/601/evidence/701',auditor)).status,403);
      assert.equal((await send('POST','/api/sesi/501/finalize',tester,{})).status,403);
      assert.equal((await send('POST','/api/projects/1/members',tester,{})).status,403);
    });
    await t.test('ADMIN cannot finalize incomplete canonical test plan', async () => {
      const res=await send('POST','/api/sesi/501/finalize',admin,{});
      assert.equal(res.status,422);
      assert.match((await res.json()).error,/wajib diuji/);
    });
    await t.test('real login, server-session validation and logout revocation', async () => {
      const res=await send('POST','/api/auth/login',null,{
        email:'user101@integration.invalid',password,
      });
      assert.equal(res.status,200,await res.clone().text());
      const cookies=res.headers.get('set-cookie')||'';
      const match=cookies.match(/qa_access=([^;,\s]+)/);
      assert.ok(match,'Login should set an access cookie');
      const cookie='qa_access='+match[1];
      const get=await app.fetch(new Request('https://qamanager-integration.invalid/api/auth/me',{
        headers:{cookie},
      }),environment);
      assert.equal(get.status,200);
      const out=await app.fetch(new Request('https://qamanager-integration.invalid/api/auth/logout',{
        method:'POST',headers:{cookie,'Content-Type':'application/json',
          'x-requested-with':'XMLHttpRequest'},
        body:'{}',
      }),environment);
      assert.equal(out.status,200,await out.clone().text());
      const after=await app.fetch(new Request('https://qamanager-integration.invalid/api/auth/me',{
        headers:{cookie},
      }),environment);
      assert.equal(after.status,401,'Logout must revoke server session');
    });
  } finally {
    await db.end();
  }
});
