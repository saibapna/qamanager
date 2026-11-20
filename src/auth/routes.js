import express from 'express';
import { verifyPassword } from './passwords.js';
import { signAccess, signRefresh, verifyRefresh, hashToken } from './tokens.js';
import { requireAuth } from './middleware.js';

const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
async function memberships(db, userId) {
  const {rows} = await db.query(
    `SELECT pm.project_id,p.kode,p.nama,pm.role FROM project_members pm
     JOIN projects p ON p.id=pm.project_id WHERE pm.user_id=$1 AND p.aktif=TRUE ORDER BY p.kode`, [userId]);
  return rows;
}
export function authRoutes(db) {
  const router = express.Router();
  router.post('/login', wrap(async (req,res) => {
    const {email, password} = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({error:'Email & password wajib'});
    }
    const {rows:[u]} = await db.query('SELECT id,email,nama,password_hash,aktif FROM users WHERE lower(email)=lower($1)', [email.trim()]);
    let verified = false;
    try { if (u?.aktif) verified = await verifyPassword(u.password_hash, password); }
    catch { verified = false; }
    if (!verified) return res.status(401).json({error:'Kredensial salah'});
    const projects = await memberships(db,u.id);
    const user = {id:u.id,email:u.email,nama:u.nama,projects};
    const accessToken = signAccess({id:u.id,email:u.email,nama:u.nama});
    const refreshToken = signRefresh({id:u.id});
    const expiresAt = new Date(verifyRefresh(refreshToken).exp * 1000);
    await db.query('INSERT INTO refresh_tokens (user_id,token_hash,expires_at) VALUES ($1,$2,$3)',[u.id,hashToken(refreshToken),expiresAt]);
    res.json({accessToken,refreshToken,user});
  }));
  router.post('/refresh', wrap(async (req,res) => {
    const oldToken = req.body?.refreshToken;
    if (typeof oldToken !== 'string') return res.status(400).json({error:'refreshToken wajib'});
    let payload;
    try { payload=verifyRefresh(oldToken); } catch { return res.status(401).json({error:'Refresh token invalid'}); }
    const client=await db.connect();
    let u;
    let refreshToken;
    try {
      await client.query('BEGIN');
      const r=await client.query(`UPDATE refresh_tokens SET revoked=TRUE WHERE user_id=$1 AND token_hash=$2
        AND revoked=FALSE AND expires_at>NOW() RETURNING id`,[payload.id,hashToken(oldToken)]);
      if (!r.rowCount) {await client.query('ROLLBACK');return res.status(401).json({error:'Refresh token revoked'});}
      const ur=await client.query('SELECT id,email,nama FROM users WHERE id=$1 AND aktif=TRUE',[payload.id]);
      u=ur.rows[0];
      if (!u) {await client.query('ROLLBACK');return res.status(401).json({error:'Akun nonaktif'});}
      refreshToken=signRefresh({id:u.id});
      await client.query('INSERT INTO refresh_tokens (user_id,token_hash,expires_at) VALUES ($1,$2,$3)',
        [u.id,hashToken(refreshToken),new Date(verifyRefresh(refreshToken).exp*1000)]);
      await client.query('COMMIT');
    } catch (e) {await client.query('ROLLBACK');throw e;} finally {client.release();}
    const projects=await memberships(db,u.id);
    res.json({accessToken:signAccess({id:u.id,email:u.email,nama:u.nama}),refreshToken,user:{...u,projects}});
  }));
  router.post('/logout',requireAuth,wrap(async (req,res) => {
    if (typeof req.body?.refreshToken === 'string') {
      await db.query('UPDATE refresh_tokens SET revoked=TRUE WHERE token_hash=$1 AND user_id=$2',
        [hashToken(req.body.refreshToken),req.user.id]);
    }
    res.json({ok:true});
  }));
  router.get('/me',requireAuth,wrap(async(req,res)=>{
    const {rows:[u]}=await db.query('SELECT id,email,nama FROM users WHERE id=$1 AND aktif=TRUE',[req.user.id]);
    if(!u)return res.status(401).json({error:'Akun tidak aktif'});
    res.json({...u,projects:await memberships(db,u.id)});
  }));
  return router;
}
