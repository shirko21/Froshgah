export function notFound(req,res) { res.status(404).json({ error: 'مسیر موردنظر پیدا نشد.' }); }
export function errorHandler(err, req, res, next) {
  console.error(err);
  if (err.code === '23505') return res.status(409).json({ error: 'این مقدار قبلاً ثبت شده است.' });
  if (err.code === '23503') return res.status(409).json({ error: 'این مورد به اطلاعات دیگری وابسته است و فعلاً قابل حذف نیست.' });
  if (err.name === 'MulterError') return res.status(400).json({ error: err.message });
  res.status(err.status || 500).json({ error: err.publicMessage || 'خطای داخلی سرور رخ داد.' });
}
