import express from 'express';
import { hashPassword, verifyPassword } from './passwords.js';
import { signAccess, signRefresh, verifyRefresh, hashToken } from './tokens.js';
import { requireAuth } from './middleware.js';

export function authRoutes(db) {
  const r = express.Router();

  r.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email & password wajib' });
    const { rows } = await db.query(
      'SELECT id, email, nama, password_hash, aktif FROM users WHERE email = $1', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Kredensial salah' });
    const u = rows[0];
    if (!u.aktif) return res.status(403).json({ error: 'Akun nonaktif' });
    if (!(await verifyPassword(u.password_hash, password)))
      return res.status(401).json({ error: 'Kredensial salah' });

    const { rows: members } = await db.query(
      `SELECT pm.project_id, p.kode, p.nama, pm.role
       FROM project_members pm JOIN projects p ON p.id = pm.project_id
       WHERE pm.user_id = $1`, [u.id]);

    const payload = { id: u.id, email: u.email, nama: u.nama, projects: members };
    const accessToken = signAccess(payload);
    const refreshToken = signRefresh({ id: u.id });

    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [u.id, hashToken(refreshToken)]);

    res.json({ accessToken, refreshToken, user: payload });
  });

  r.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken wajib' });
    let d; try { d = verifyRefresh(refreshToken); }
    catch { return res.status(401).json({ error: 'Refresh token invalid' }); }
    const { rows } = await db.query(
      `SELECT id FROM refresh_tokens WHERE user_id=$1 AND token_hash=$2
       AND revoked=FALSE AND expires_at>NOW()`, [d.id, hashToken(refreshToken)]);
    if (!rows.length) return res.status(401).json({ error: 'Refresh token revoked' });
    const { rows: [u] } = await db.query(
      'SELECT id, email, nama FROM users WHERE id=$1', [d.id]);
    const { rows: members } = await db.query(
      `SELECT pm.project_id, p.kode, p.nama, pm.role
       FROM project_members pm JOIN projects p ON p.id = pm.project_id
       WHERE pm.user_id=$1`, [u.id]);
    const accessToken = signAccess({ ...u, projects: members });
    res.json({ accessToken, user: { ...u, projects: members } });
  });

  r.post('/logout', requireAuth, async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await db.query('UPDATE refresh_tokens SET revoked=TRUE WHERE token_hash=$1',
        [hashToken(refreshToken)]);
    }
    res.json({ ok: true });
  });

  r.get('/me', requireAuth, async (req, res) => {
    const { rows } = await db.query(
      `SELECT pm.project_id, p.kode, p.nama, pm.role
       FROM project_members pm JOIN projects p ON p.id = pm.project_id
       WHERE pm.user_id=$1`, [req.user.id]);
    res.json({ ...req.user, projects: rows });
  });

  return r;
}
