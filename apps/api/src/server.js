import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, assertConfig } from './config.js';
import { pool } from './db.js';
import { migrate } from './scripts/migrate.js';
import { seed } from './scripts/seed.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import uploadRoutes from './routes/upload.js';
import { notFound,errorHandler } from './middleware/error.js';

assertConfig();
await migrate();
const adminCount=await pool.query('SELECT count(*)::int count FROM admins');
if(adminCount.rows[0].count===0) await seed();

const app=express();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
app.set('trust proxy',1);
app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'},contentSecurityPolicy:false}));
app.use(cors({origin:config.webOrigin.split(',').map(x=>x.trim()),credentials:true}));
app.use(cookieParser());
app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:false,limit:'1mb'}));
app.use('/api',rateLimit({windowMs:60*1000,limit:300,standardHeaders:true,legacyHeaders:false}));
app.use('/uploads',express.static(path.resolve(__dirname,'../uploads'),{maxAge:'7d',immutable:true}));
app.get('/api/health',(req,res)=>res.json({ok:true,name:'FlexiShop API'}));
app.use('/api/auth',authRoutes);
app.use('/api/public',publicRoutes);
app.use('/api/admin',adminRoutes);
app.use('/api/upload',uploadRoutes);

if(config.nodeEnv==='production'){
 const web=path.resolve(__dirname,'../../web/dist');
 app.use(express.static(web,{maxAge:'1h'}));
 app.get('*',(req,res,next)=>req.path.startsWith('/api/')?next():res.sendFile(path.join(web,'index.html')));
}
app.use(notFound);app.use(errorHandler);
const server=app.listen(config.port,()=>console.log(`FlexiShop running on http://localhost:${config.port}`));
async function shutdown(){server.close(async()=>{await pool.end();process.exit(0)})}process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
