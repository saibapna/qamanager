import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
if (process.env.NODE_ENV === 'production' && (!ACCESS_SECRET || !REFRESH_SECRET || ACCESS_SECRET.length < 32 || REFRESH_SECRET.length < 32 || ACCESS_SECRET === REFRESH_SECRET || ACCESS_SECRET.startsWith('CHANGE_TO_') || REFRESH_SECRET.startsWith('CHANGE_TO_'))) {
  throw new Error('JWT_ACCESS_SECRET dan JWT_REFRESH_SECRET minimal 32 karakter wajib di production');
}
const accessSecret = ACCESS_SECRET || 'local-development-access-secret-please-change';
const refreshSecret = REFRESH_SECRET || 'local-development-refresh-secret-please-change';
export const signAccess = p => jwt.sign(p, accessSecret, { expiresIn: process.env.JWT_ACCESS_TTL || '15m' });
export const signRefresh = p => jwt.sign({...p, jti:crypto.randomUUID()}, refreshSecret, {expiresIn:process.env.JWT_REFRESH_TTL || '7d'});
export const verifyAccess = t => jwt.verify(t, accessSecret);
export const verifyRefresh = t => jwt.verify(t, refreshSecret);
export const hashToken = t => crypto.createHash('sha256').update(t).digest('hex');
