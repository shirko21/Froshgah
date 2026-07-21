import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { config, assertConfig } from '../config.js';
import { migrate } from './migrate.js';

export async function seed() {
  assertConfig();
  await migrate();
  const hash = await bcrypt.hash(config.adminPassword, 12);
  await pool.query(`INSERT INTO admins(name,email,password_hash,role)
    VALUES($1,$2,$3,'owner') ON CONFLICT(email) DO NOTHING`, [config.adminName, config.adminEmail, hash]);

  const cat = await pool.query(`INSERT INTO categories(name,slug,description,sort_order)
    VALUES ('محصولات نمونه','sample-products','این دسته‌بندی را از پنل ویرایش یا حذف کنید.',1)
    ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`);
  const categoryId = cat.rows[0]?.id || (await pool.query(`SELECT id FROM categories WHERE slug='sample-products'`)).rows[0].id;
  await pool.query(`INSERT INTO products(category_id,name,slug,sku,short_description,description,price,compare_at_price,stock,is_featured,image_url)
    VALUES ($1,'محصول نمونه','sample-product','SAMPLE-001','نمونه‌ای برای نمایش قالب','این محصول را از پنل مدیریت ویرایش یا حذف کنید.',250000,300000,20,true,'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80')
    ON CONFLICT(slug) DO NOTHING`, [categoryId]);
  await pool.query(`INSERT INTO shipping_methods(name,description,price,estimated_days,sort_order)
    SELECT 'ارسال استاندارد','ارسال عادی به سراسر کشور',50000,'۲ تا ۵ روز کاری',1
    WHERE NOT EXISTS(SELECT 1 FROM shipping_methods)`);
  await pool.query(`INSERT INTO payment_methods(code,name,description,instructions,sort_order)
    VALUES ('cod','پرداخت در محل','پرداخت هنگام تحویل سفارش','این روش فقط برای مناطق تحت پوشش فعال کنید.',1),
           ('bank_transfer','کارت به کارت','پرداخت از طریق انتقال بانکی','شماره کارت و راهنمای پرداخت را در این قسمت وارد کنید.',2)
    ON CONFLICT(code) DO NOTHING`);
  await pool.query(`INSERT INTO pages(title,slug,content,sort_order)
    VALUES ('درباره ما','about','متن معرفی فروشگاه را از پنل مدیریت تغییر دهید.',1),
           ('قوانین و شرایط','terms','قوانین خرید، مرجوعی و حریم خصوصی را اینجا بنویسید.',2)
    ON CONFLICT(slug) DO NOTHING`);
  console.log('Seed completed.');
}

if (process.argv[1]?.endsWith('seed.js')) {
  seed().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
