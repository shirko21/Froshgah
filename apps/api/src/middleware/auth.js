import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';

export async function requireAdmin(req, res, next) {
  try {
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
    const token = req.cookies?.shop_admin_token || bearer;
    if (!token) return res.status(401).json({ error: 'برای ادامه وارد پنل شوید.' });
    const payload = jwt.verify(token, config.jwtSecret);
    const result = await query('SELECT id,name,email,role,is_active FROM admins WHERE id=$1', [payload.sub]);
    const admin = result.rows[0];
    if (!admin?.is_active) return res.status(401).json({ error: 'حساب مدیر غیرفعال است.' });
    req.admin = admin;
    next();
  } catch {
    res.status(401).json({ error: 'نشست شما معتبر نیست یا پایان یافته است.' });
  }
}

export function requireRole(...roles) {
  return (req,res,next) => roles.includes(req.admin?.role) ? next() : res.status(403).json({ error: 'دسترسی کافی ندارید.' });
}
