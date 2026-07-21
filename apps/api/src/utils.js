import slugify from 'slugify';
import crypto from 'node:crypto';

export const toSlug = (value) => slugify(String(value || ''), { lower: true, strict: true, locale: 'fa' }) || crypto.randomUUID().slice(0, 8);
export const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export const bool = (value) => value === true || value === 'true' || value === 1 || value === '1';
export const jsonArray = (value) => Array.isArray(value) ? value : [];
export const jsonObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export const orderNumber = () => `FS-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomInt(100000,999999)}`;
export function cleanText(value, max=5000) { return String(value ?? '').trim().slice(0,max); }
