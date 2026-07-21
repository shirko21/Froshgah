import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requireAdmin, requireRole } from '../middleware/auth.js';
import { toSlug, bool, jsonArray, jsonObject, cleanText } from '../utils.js';

const router=Router();
router.use(requireAdmin);
const tables=new Set(['categories','products','banners','pages','shipping_methods','payment_methods','coupons']);
const fields={
 categories:['name','slug','description','image_url','is_active','sort_order'],
 products:['category_id','name','slug','sku','short_description','description','price','compare_at_price','stock','low_stock_threshold','image_url','gallery','attributes','weight','is_active','is_featured'],
 banners:['title','subtitle','image_url','link_url','button_text','position','is_active','sort_order'],
 pages:['title','slug','content','is_published','sort_order'],
 shipping_methods:['name','description','price','min_order','max_order','estimated_days','is_active','sort_order'],
 payment_methods:['code','name','description','instructions','is_active','sort_order'],
 coupons:['code','type','value','min_order','max_discount','starts_at','ends_at','usage_limit','is_active']
};
function normalize(table,data){
 const out={}; for(const key of fields[table]) if(Object.prototype.hasOwnProperty.call(data,key)) out[key]=data[key]===''?null:data[key];
 for(const k of ['is_active','is_featured','is_published']) if(k in out) out[k]=bool(out[k]);
 if(table==='products'){ out.gallery=jsonArray(out.gallery); out.attributes=jsonObject(out.attributes); if(!out.slug&&out.name) out.slug=toSlug(out.name); if(out.category_id==='') out.category_id=null; }
 if(['categories','pages'].includes(table)&&!out.slug&&out.name) out.slug=toSlug(out.name);
 if(table==='pages'&&!out.slug&&out.title) out.slug=toSlug(out.title);
 if(table==='coupons'&&out.code) out.code=String(out.code).trim().toUpperCase();
 return out;
}
async function audit(req,action,type,id,metadata={}){ await query('INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[req.admin.id,action,type,String(id||''),metadata]); }

router.get('/dashboard',async(req,res)=>{
 const [orders,revenue,products,lowStock,recent]=await Promise.all([
  query(`SELECT count(*)::int count FROM orders`), query(`SELECT COALESCE(sum(total) FILTER(WHERE payment_status='paid'),0)::numeric total FROM orders`),
  query(`SELECT count(*)::int count FROM products`), query(`SELECT count(*)::int count FROM products WHERE stock<=low_stock_threshold`),
  query(`SELECT id,order_number,customer_name,total,status,payment_status,created_at FROM orders ORDER BY created_at DESC LIMIT 8`)
 ]); res.json({stats:{orders:orders.rows[0].count,revenue:Number(revenue.rows[0].total),products:products.rows[0].count,lowStock:lowStock.rows[0].count},recentOrders:recent.rows});
});

router.get('/settings',async(req,res)=>res.json({settings:(await query('SELECT * FROM settings WHERE id=1')).rows[0]}));
router.put('/settings',requireRole('owner','admin'),async(req,res)=>{
 const allowed=['store_name','tagline','logo_url','favicon_url','primary_color','secondary_color','accent_color','currency','currency_symbol','contact_email','phone','address','instagram_url','telegram_url','whatsapp_url','about_text','footer_text','hero_title','hero_subtitle','hero_image_url','hero_button_text','hero_button_url','seo_title','seo_description','maintenance_mode','allow_guest_checkout','tax_percent','free_shipping_threshold','products_per_page','low_stock_alert'];
 const data={}; for(const k of allowed) if(k in req.body) data[k]=req.body[k];
 for(const k of ['maintenance_mode','allow_guest_checkout']) if(k in data) data[k]=bool(data[k]);
 if(!Object.keys(data).length) return res.status(400).json({error:'چیزی برای ذخیره ارسال نشده است.'});
 const sets=[],vals=[]; Object.entries(data).forEach(([k,v])=>{vals.push(v);sets.push(`${k}=$${vals.length}`)});
 const result=await query(`UPDATE settings SET ${sets.join(',')},updated_at=now() WHERE id=1 RETURNING *`,vals); await audit(req,'update','settings',1); res.json({settings:result.rows[0]});
});

router.get('/resource/:table',async(req,res)=>{
 const {table}=req.params;if(!tables.has(table)) return res.status(404).json({error:'منبع نامعتبر است.'});
 let sql=`SELECT * FROM ${table}`;
 if(table==='products') sql=`SELECT p.*,c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id`;
 sql+=' ORDER BY '+(table==='products'?'p.created_at DESC':table==='coupons'?'created_at DESC':'sort_order NULLS LAST, id DESC');
 res.json({items:(await query(sql)).rows});
});
router.post('/resource/:table',requireRole('owner','admin','editor'),async(req,res)=>{
 const {table}=req.params;if(!tables.has(table)) return res.status(404).json({error:'منبع نامعتبر است.'});
 const data=normalize(table,req.body); const keys=Object.keys(data); if(!keys.length) return res.status(400).json({error:'اطلاعاتی ارسال نشده است.'});
 const vals=Object.values(data).map(v=>typeof v==='object'&&v!==null?JSON.stringify(v):v);
 const placeholders=keys.map((k,i)=> (['gallery','attributes'].includes(k)?`$${i+1}::jsonb`:`$${i+1}`));
 const item=(await query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${placeholders.join(',')}) RETURNING *`,vals)).rows[0]; await audit(req,'create',table,item.id); res.status(201).json({item});
});
router.put('/resource/:table/:id',requireRole('owner','admin','editor'),async(req,res)=>{
 const {table,id}=req.params;if(!tables.has(table)) return res.status(404).json({error:'منبع نامعتبر است.'});
 const data=normalize(table,req.body); const keys=Object.keys(data); if(!keys.length) return res.status(400).json({error:'اطلاعاتی ارسال نشده است.'});
 const vals=[]; const sets=keys.map(k=>{vals.push(typeof data[k]==='object'&&data[k]!==null?JSON.stringify(data[k]):data[k]);return `${k}=$${vals.length}${['gallery','attributes'].includes(k)?'::jsonb':''}`}); vals.push(id);
 const item=(await query(`UPDATE ${table} SET ${sets.join(',')}${['products','categories','pages'].includes(table)?',updated_at=now()':''} WHERE id=$${vals.length} RETURNING *`,vals)).rows[0];
 if(!item) return res.status(404).json({error:'مورد پیدا نشد.'}); await audit(req,'update',table,id); res.json({item});
});
router.delete('/resource/:table/:id',requireRole('owner','admin'),async(req,res)=>{
 const {table,id}=req.params;if(!tables.has(table)) return res.status(404).json({error:'منبع نامعتبر است.'});
 const result=await query(`DELETE FROM ${table} WHERE id=$1 RETURNING id`,[id]); if(!result.rowCount)return res.status(404).json({error:'مورد پیدا نشد.'}); await audit(req,'delete',table,id); res.json({ok:true});
});

router.get('/orders',async(req,res)=>{
 const vals=[];const where=[];if(req.query.status){vals.push(req.query.status);where.push(`status=$${vals.length}`)};if(req.query.q){vals.push(`%${req.query.q}%`);where.push(`(order_number ILIKE $${vals.length} OR customer_name ILIKE $${vals.length} OR customer_phone ILIKE $${vals.length})`)};
 const rows=await query(`SELECT * FROM orders ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC LIMIT 500`,vals);res.json({orders:rows.rows});
});
router.get('/orders/:id',async(req,res)=>{const r=await query('SELECT * FROM orders WHERE id=$1',[req.params.id]);if(!r.rowCount)return res.status(404).json({error:'سفارش پیدا نشد.'});res.json({order:r.rows[0]})});
router.put('/orders/:id',requireRole('owner','admin','editor'),async(req,res)=>{
 const parsed=z.object({status:z.enum(['pending','confirmed','processing','shipped','delivered','cancelled']).optional(),payment_status:z.enum(['unpaid','pending','paid','failed','refunded']).optional(),admin_note:z.string().max(2000).optional()}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'وضعیت نامعتبر است.'});
 if(!Object.keys(parsed.data).length)return res.status(400).json({error:'تغییری ارسال نشده است.'});
 const order=await tx(async client=>{
  const current=(await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
  if(!current)throw Object.assign(new Error('not-found'),{status:404,publicMessage:'سفارش پیدا نشد.'});
  if(parsed.data.status==='cancelled'&&current.status!=='cancelled'){
   for(const item of current.items||[]) await client.query('UPDATE products SET stock=stock+$1,updated_at=now() WHERE id=$2',[item.quantity,item.productId]);
  }
  if(parsed.data.status&&parsed.data.status!=='cancelled'&&current.status==='cancelled'){
   for(const item of current.items||[]){
    const product=(await client.query('SELECT stock,name FROM products WHERE id=$1 FOR UPDATE',[item.productId])).rows[0];
    if(!product||product.stock<item.quantity)throw Object.assign(new Error('stock'),{status:400,publicMessage:`برای فعال‌کردن دوباره سفارش، موجودی «${product?.name||item.name}» کافی نیست.`});
    await client.query('UPDATE products SET stock=stock-$1,updated_at=now() WHERE id=$2',[item.quantity,item.productId]);
   }
  }
  const keys=Object.keys(parsed.data),vals=[];const sets=keys.map(k=>{vals.push(parsed.data[k]);return `${k}=$${vals.length}`});vals.push(req.params.id);
  return (await client.query(`UPDATE orders SET ${sets.join(',')},updated_at=now() WHERE id=$${vals.length} RETURNING *`,vals)).rows[0];
 });
 await audit(req,'update','orders',req.params.id,parsed.data);res.json({order});
});

router.get('/admins',requireRole('owner'),async(req,res)=>res.json({admins:(await query('SELECT id,name,email,role,is_active,created_at FROM admins ORDER BY id')).rows}));
router.post('/admins',requireRole('owner'),async(req,res)=>{const p=z.object({name:z.string().min(2),email:z.string().email(),password:z.string().min(8),role:z.enum(['owner','admin','editor']).default('admin')}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'اطلاعات مدیر معتبر نیست.'});const hash=await bcrypt.hash(p.data.password,12);const admin=(await query('INSERT INTO admins(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role,is_active,created_at',[p.data.name,p.data.email,hash,p.data.role])).rows[0];await audit(req,'create','admins',admin.id);res.status(201).json({admin})});
router.put('/admins/:id',requireRole('owner'),async(req,res)=>{const p=z.object({name:z.string().min(2).optional(),email:z.string().email().optional(),password:z.string().min(8).optional(),role:z.enum(['owner','admin','editor']).optional(),is_active:z.boolean().optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'اطلاعات مدیر معتبر نیست.'});const d={...p.data};if(d.password){d.password_hash=await bcrypt.hash(d.password,12);delete d.password;}const keys=Object.keys(d);const vals=[];const sets=keys.map(k=>{vals.push(d[k]);return `${k}=$${vals.length}`});vals.push(req.params.id);const admin=(await query(`UPDATE admins SET ${sets.join(',')},updated_at=now() WHERE id=$${vals.length} RETURNING id,name,email,role,is_active,created_at`,vals)).rows[0];await audit(req,'update','admins',req.params.id);res.json({admin})});
router.delete('/admins/:id',requireRole('owner'),async(req,res)=>{if(String(req.params.id)===String(req.admin.id))return res.status(400).json({error:'نمی‌توانید حساب خودتان را حذف کنید.'});await query('DELETE FROM admins WHERE id=$1',[req.params.id]);await audit(req,'delete','admins',req.params.id);res.json({ok:true})});
export default router;
