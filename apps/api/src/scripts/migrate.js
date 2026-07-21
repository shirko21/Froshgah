import { pool } from '../db.js';
import { migrations } from '../migrations.js';
import { assertConfig } from '../config.js';

export async function migrate() {
  assertConfig();
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  for (const migration of migrations) {
    const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE id=$1', [migration.id]);
    if (exists.rowCount) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations(id) VALUES($1)', [migration.id]);
      await client.query('COMMIT');
      console.log(`Applied migration ${migration.id}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}

if (process.argv[1]?.endsWith('migrate.js')) {
  migrate().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
