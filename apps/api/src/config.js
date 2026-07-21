import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
  adminName: process.env.ADMIN_NAME || 'Site Manager',
  uploadMaxMb: Number(process.env.UPLOAD_MAX_MB || 5),
};

export function assertConfig() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required');
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }
  if (config.nodeEnv === 'production' && config.adminPassword === 'ChangeMe123!') {
    console.warn('WARNING: change the default ADMIN_PASSWORD before public deployment.');
  }
}
