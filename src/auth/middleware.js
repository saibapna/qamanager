import { verifyAccess } from './tokens.js';

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = verifyAccess(token); next(); }
  catch { return res.status(401).json({ error: 'Token tidak valid/expired' }); }
}

export function requireProjectRole(...allowedRoles) {
  return async (req, res, next) => {
    const projectId =
      req.params.projectId ? Number(req.params.projectId) :
      req.body.project_id ? Number(req.body.project_id) :
      req.projectId;
    if (!projectId) return res.status(400).json({ error: 'project_id wajib' });
    const { rows } = await req.db.query(
      `SELECT role FROM project_members WHERE user_id = $1 AND project_id = $2`,
      [req.user.id, projectId]
    );
    if (!rows.length) return res.status(403).json({ error: 'Bukan anggota project' });
    if (!allowedRoles.includes(rows[0].role)) {
      return res.status(403).json({ error: `Butuh role: ${allowedRoles.join('/')}` });
    }
    req.user.projectRole = rows[0].role;
    req.projectId = projectId;
    next();
  };
}
