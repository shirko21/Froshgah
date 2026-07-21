import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { money, orderNumber, cleanText } from '../utils.js';
import { isSupportedPayment } from '../services/payment-providers.js';

const router = Router();
const orderLimit=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:true,legacyHeaders:false});

router.get('/bootstrap', async (req,res) => {
  const [settings,categories,banners,pages,shipping,payments] = await Promise.all([
    query('SELECT * FROM settings WHERE id=1'),
    query('SELECT * FROM categories WHERE is_active=true ORDER BY sort_order,name'),
    query('SELECT * FROM banners WHERE is_active=true ORDER BY sort_order,id'),
    query('SELECT id,title,slug,sort_order FROM pages WHERE is_published=true ORDER BY sort_order,title'),
    query('SELECT * FROM shipping_methods WHERE is_active=true ORDER BY sort_order,id'),
    query('SELECT id,code,name,description,instructions FROM payment_methods WHERE is_active=true ORDER BY sort_order,id')
  ]);
  res.json({ settings:settings.rows[0], categories:categories.rows, banners:banners.rows, pages:pages.rows, shippingMethods:shipping.rows, paymentMethods:payments.rows });
});

router.get('/products', async (req,res) => {
  const page=Math.max(1,Number(req.query.page)||1), limit=Math.min(48,Math.max(1,Number(req.query.limit)||12));
  const values=[]; const where=['p.is_active=true'];
  if (req.query.category) { values.push(req.query.category); where.push(`c.slug=$${values.length}`); }
  if (req.query.featured==='true') where.push('p.is_featured=true');
  if (req.query.q) { values.push(`%${String(req.query.q).slice(0,100)}%`); where.push(`(p.name ILIKE $${values.length} OR p.description ILIKE $${values.length} OR p.sku ILIKE $${values.length})`); }
  const sortMap={ newest:'p.created_at DESC', price_asc:'p.price ASC', price_desc:'p.price DESC', name:'p.name ASC' };
  const sort=sortMap[req.query.sort] || sortMap.newest;
  const count=await query(`SELECT count(*)::int total FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${where.join(' AND ')}`,values);
  values.push(limit,(page-1)*limit);
  const rows=await query(`SELECT p.*,c.name category_name,c.slug category_slug FROM products p LEFT JOIN categories c ON c.id=p.category_id
    WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT $${values.length-1} OFFSET $${values.length}`,values);
  res.json({ products:rows.rows, total:count.rows[0].total, page, pages:Math.ceil(count.rows[0].total/limit) });
});

router.get('/products/:slug', async (req,res) => {
  const result=await query(`SELECT p.*,c.name category_name,c.slug category_slug FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.slug=$1 AND p.is_active=true`,[req.params.slug]);
  if (!result.rowCount) return res.status(404).json({error:'محصول پیدا نشد.'});
  res.json({product:result.rows[0]});
});

router.get('/pages/:slug', async (req,res) => {
  const result=await query('SELECT * FROM pages WHERE slug=$1 AND is_published=true',[req.params.slug]);
  if (!result.rowCount) return res.status(404).json({error:'صفحه پیدا نشد.'});
  res.json({page:result.rows[0]});
});

router.post('/coupon/validate', async (req,res) => {
  const code=cleanText(req.body.code,50); const subtotal=Number(req.body.subtotal||0);
  const result=await query(`SELECT * FROM coupons WHERE code=$1 AND is_active=true AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now()) AND (usage_limit IS NULL OR used_count<usage_limit)`,[code]);
  const c=result.rows[0];
  if (!c || subtotal<Number(c.min_order)) return res.status(400).json({error:'کد تخفیف معتبر نیست یا شرایط آن برقرار نیست.'});
  let discount=c.type==='percent' ? subtotal*Number(c.value)/100 : Number(c.value);
  if (c.max_discount) discount=Math.min(discount,Number(c.max_discount));
  discount=Math.min(discount,subtotal);
  res.json({code:c.code,discount:money(discount)});
});

const orderSchema=z.object({
  customerName:z.string().min(2).max(120), customerEmail:z.string().email().or(z.literal('')).optional().default(''),
  customerPhone:z.string().min(7).max(30), address:z.string().min(8).max(1000), city:z.string().max(100).optional().default(''),
  postalCode:z.string().max(30).optional().default(''), notes:z.string().max(1000).optional().default(''),
  paymentMethod:z.string().min(2).max(40), shippingMethodId:z.coerce.number().int().positive(), couponCode:z.string().max(50).optional().default(''),
  items:z.array(z.object({productId:z.coerce.number().int().positive(),quantity:z.coerce.number().int().min(1).max(100)})).min(1).max(50)
});

router.post('/orders', orderLimit, async (req,res) => {
  const parsed=orderSchema.safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:'اطلاعات سفارش کامل یا معتبر نیست.',details:parsed.error.flatten()});
  const input=parsed.data;
  if(!isSupportedPayment(input.paymentMethod)) return res.status(400).json({error:'روش پرداخت پشتیبانی نمی‌شود.'});
  try {
    const result=await tx(async client=>{
      const ids=input.items.map(x=>x.productId);
      const products=(await client.query('SELECT * FROM products WHERE id=ANY($1::bigint[]) AND is_active=true FOR UPDATE',[ids])).rows;
      if(products.length!==new Set(ids).size) throw Object.assign(new Error('product'),{status:400,publicMessage:'یک یا چند محصول دیگر موجود نیست.'});
      const productMap=new Map(products.map(p=>[Number(p.id),p]));
      let subtotal=0;
      const items=input.items.map(item=>{
        const p=productMap.get(item.productId);
        if(item.quantity>p.stock) throw Object.assign(new Error('stock'),{status:400,publicMessage:`موجودی «${p.name}» کافی نیست.`});
        const line=money(Number(p.price)*item.quantity); subtotal+=line;
        return {productId:Number(p.id),name:p.name,slug:p.slug,sku:p.sku,price:Number(p.price),quantity:item.quantity,lineTotal:line,imageUrl:p.image_url};
      });
      subtotal=money(subtotal);
      const shipping=(await client.query('SELECT * FROM shipping_methods WHERE id=$1 AND is_active=true',[input.shippingMethodId])).rows[0];
      if(!shipping || subtotal<Number(shipping.min_order) || (shipping.max_order && subtotal>Number(shipping.max_order))) throw Object.assign(new Error('shipping'),{status:400,publicMessage:'روش ارسال برای این سفارش معتبر نیست.'});
      const settings=(await client.query('SELECT * FROM settings WHERE id=1')).rows[0];
      if(settings.maintenance_mode) throw Object.assign(new Error('maintenance'),{status:503,publicMessage:'ثبت سفارش موقتاً غیرفعال است.'});
      if(!settings.allow_guest_checkout) throw Object.assign(new Error('checkout'),{status:403,publicMessage:'ثبت سفارش مهمان در حال حاضر غیرفعال است.'});
      let shippingAmount=Number(shipping.price);
      if(Number(settings.free_shipping_threshold)>0 && subtotal>=Number(settings.free_shipping_threshold)) shippingAmount=0;
      let discount=0; let coupon=null;
      if(input.couponCode){
        coupon=(await client.query(`SELECT * FROM coupons WHERE code=$1 AND is_active=true AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now()) AND (usage_limit IS NULL OR used_count<usage_limit) FOR UPDATE`,[input.couponCode])).rows[0];
        if(!coupon || subtotal<Number(coupon.min_order)) throw Object.assign(new Error('coupon'),{status:400,publicMessage:'کد تخفیف معتبر نیست.'});
        discount=coupon.type==='percent'?subtotal*Number(coupon.value)/100:Number(coupon.value);
        if(coupon.max_discount) discount=Math.min(discount,Number(coupon.max_discount));
        discount=money(Math.min(discount,subtotal));
      }
      const taxable=Math.max(0,subtotal-discount); const tax=money(taxable*Number(settings.tax_percent)/100); const total=money(taxable+shippingAmount+tax);
      const payment=(await client.query('SELECT * FROM payment_methods WHERE code=$1 AND is_active=true',[input.paymentMethod])).rows[0];
      if(!payment) throw Object.assign(new Error('payment'),{status:400,publicMessage:'روش پرداخت غیرفعال است.'});
      const number=orderNumber();
      const order=(await client.query(`INSERT INTO orders(order_number,payment_method,shipping_method_id,shipping_method_name,customer_name,customer_email,customer_phone,address,city,postal_code,notes,subtotal,shipping_amount,tax_amount,discount_amount,total,coupon_code,items)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb) RETURNING *`,[number,input.paymentMethod,shipping.id,shipping.name,input.customerName,input.customerEmail,input.customerPhone,input.address,input.city,input.postalCode,input.notes,subtotal,shippingAmount,tax,discount,total,coupon?.code||'',JSON.stringify(items)])).rows[0];
      for(const item of items) await client.query('UPDATE products SET stock=stock-$1,updated_at=now() WHERE id=$2',[item.quantity,item.productId]);
      if(coupon) await client.query('UPDATE coupons SET used_count=used_count+1 WHERE id=$1',[coupon.id]);
      return {order,paymentInstructions:payment.instructions};
    });
    res.status(201).json(result);
  } catch(e){ if(e.status) return res.status(e.status).json({error:e.publicMessage}); throw e; }
});

router.get('/orders/track/:number', async(req,res)=>{
  const phone=cleanText(req.query.phone,30);
  const result=await query('SELECT order_number,status,payment_status,total,created_at,updated_at FROM orders WHERE order_number=$1 AND customer_phone=$2',[req.params.number,phone]);
  if(!result.rowCount) return res.status(404).json({error:'سفارش پیدا نشد.'});
  res.json({order:result.rows[0]});
});

export default router;
