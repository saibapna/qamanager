import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev-access';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh';

export const signAccess = (p) => jwt.sign(p, ACCESS_SECRET, { expiresIn: '15m' });
export const signRefresh = (p) => jwt.sign(p, REFRESH_SECRET, { expiresIn: '7d' });
export const verifyAccess = (t) => jwt.verify(t, ACCESS_SECRET);
export const verifyRefresh = (t) => jwt.verify(t, REFRESH_SECRET);
export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
