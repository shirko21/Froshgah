import fs from 'node:fs';
import path from 'node:path';
const required = [
  'package.json','.env.example','docker-compose.yml','Dockerfile',
  'apps/api/src/server.js','apps/api/src/migrations.js','apps/api/src/routes/public.js','apps/api/src/routes/admin.js',
  'apps/web/src/App.jsx','apps/web/src/styles.css','apps/web/dist/index.html'
];
const missing = required.filter(file => !fs.existsSync(path.resolve(file)));
if (missing.length) {
  console.error('Missing required files:', missing.join(', '));
  process.exit(1);
}
const migration = fs.readFileSync('apps/api/src/migrations.js','utf8');
for (const table of ['admins','settings','categories','products','orders','coupons']) {
  if (!migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) throw new Error(`Missing table ${table}`);
}
const app = fs.readFileSync('apps/web/src/App.jsx','utf8');
for (const route of ['/shop','/cart','/checkout','/admin/login']) {
  if (!app.includes(`path="${route}"`)) throw new Error(`Missing route ${route}`);
}
console.log('Project structure validation passed.');
