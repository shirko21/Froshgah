import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
const loginLimit = rateLimit({ windowMs: 15*60*1000, limit: 10, standardHeaders: true, legacyHeaders: false });

router.post('/login', loginLimit, async (req,res) => {
  const parsed = z.object({ email:z.string().email(), password:z.string().min(8).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'ایمیل یا رمز عبور معتبر نیست.' });
  const result = await query('SELECT * FROM admins WHERE email=$1', [parsed.data.email]);
  const admin = result.rows[0];
  if (!admin?.is_active || !(await bcrypt.compare(parsed.data.password, admin.password_hash))) {
    return res.status(401).json({ error: 'ایمیل یا رمز عبور اشتباه است.' });
  }
  const token = jwt.sign({ sub:String(admin.id), role:admin.role }, config.jwtSecret, { expiresIn:'8h', issuer:'flexishop' });
  res.cookie('shop_admin_token', token, {
    httpOnly:true, sameSite:'lax', secure:config.nodeEnv==='production', maxAge:8*60*60*1000, path:'/'
  });
  res.json({ admin:{ id:admin.id, name:admin.name, email:admin.email, role:admin.role } });
});

router.post('/logout', (req,res) => {
  res.clearCookie('shop_admin_token', { httpOnly:true, sameSite:'lax', secure:config.nodeEnv==='production', path:'/' });
  res.json({ ok:true });
});
router.get('/me', requireAdmin, (req,res) => res.json({ admin:req.admin }));
export default router;
