import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { requireAdmin } from '../middleware/auth.js';
import { config } from '../config.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const uploadDir=path.resolve(__dirname,'../../uploads');
const allowed=new Set(['image/jpeg','image/png','image/webp','image/gif']);
const storage=multer.diskStorage({destination:uploadDir,filename:(req,file,cb)=>cb(null,`${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)});
const upload=multer({storage,limits:{fileSize:config.uploadMaxMb*1024*1024},fileFilter:(req,file,cb)=>allowed.has(file.mimetype)?cb(null,true):cb(Object.assign(new Error('فقط تصویر JPG، PNG، WEBP یا GIF مجاز است.'),{status:400,publicMessage:'فرمت فایل مجاز نیست.'}))});
const router=Router();router.post('/',requireAdmin,upload.single('file'),(req,res)=>{if(!req.file)return res.status(400).json({error:'فایلی انتخاب نشده است.'});res.status(201).json({url:`/uploads/${req.file.filename}`})});export default router;
