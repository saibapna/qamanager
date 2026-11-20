import { verifyAccess } from './tokens.js';
export { requireProjectRole, ALL_ROLES } from './authorization.js';

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({error:'Unauthorized'});
  try {
    const payload = verifyAccess(token);
    if (!payload || !Number.isSafeInteger(Number(payload.id))) throw new Error('Invalid user id');
    req.user = payload;
    next();
  } catch { res.status(401).json({error:'Token tidak valid/expired'}); }
}
