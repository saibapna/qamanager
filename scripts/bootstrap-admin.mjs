#!/usr/bin/env node
/** Provision an initial admin without committing a plaintext password or a demo account. */
import pg from 'pg';
import {hashPassword} from '../src/auth/passwords.js';

const {DATABASE_URL,ADMIN_EMAIL,ADMIN_PASSWORD,ADMIN_NAME='ULO Administrator',ADMIN_PROJECT_CODE='SIRIKAP'} = process.env;
if(!DATABASE_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length<12) {
  console.error('Set DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD (>=12 chars) and optionally ADMIN_PROJECT_CODE');
  process.exit(1);
}
const schema=process.env.DB_SCHEMA||'ulo_uat';
if(!/^[a-z_][a-z0-9_]*$/.test(schema))throw new Error('Invalid DB_SCHEMA');
const pool=new pg.Pool({connectionString:DATABASE_URL,ssl:process.env.DB_SSL==='true'?{rejectUnauthorized:true}:undefined,
  options:`-c search_path=${schema},public`,max:1});
const db=await pool.connect();
try{
  await db.query('BEGIN');
  const {rows:[project]}=await db.query('SELECT id FROM projects WHERE kode=$1',[ADMIN_PROJECT_CODE]);
  if(!project)throw new Error(`Project ${ADMIN_PROJECT_CODE} tidak ditemukan`);
  const existing=await db.query('SELECT id FROM users WHERE lower(email)=lower($1)',[ADMIN_EMAIL]);
  if(existing.rowCount)throw new Error('Akun sudah ada; jangan overwrite password secara otomatis');
  const {rows:[user]}=await db.query('INSERT INTO users(email,nama,password_hash) VALUES($1,$2,$3) RETURNING id',
    [ADMIN_EMAIL,ADMIN_NAME,await hashPassword(ADMIN_PASSWORD)]);
  await db.query("INSERT INTO project_members(user_id,project_id,role) VALUES($1,$2,'ADMIN')",[user.id,project.id]);
  await db.query('COMMIT');
  console.log(`Admin dibuat untuk project ${ADMIN_PROJECT_CODE}: ${ADMIN_EMAIL}`);
}catch(err){await db.query('ROLLBACK');console.error(err.message);process.exitCode=1;}
finally{db.release();await pool.end();}
