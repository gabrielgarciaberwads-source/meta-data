import { readFile } from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;

function required(env, name) {
  const value = env[name];
  if (!value) throw new Error(`Missing dashboard database configuration: ${name}`);
  return value;
}

export async function createDbPool({ env = process.env, fs = readFile } = {}) {
  const caFile = required(env, 'META_RAW_DB_CA_FILE');
  const ca = await fs(caFile, 'utf8');

  return new Pool({
    host: required(env, 'META_RAW_DB_HOST'),
    port: Number(env.META_RAW_DB_PORT ?? 5432),
    database: required(env, 'META_RAW_DB_NAME'),
    user: required(env, 'META_RAW_DB_USER'),
    password: required(env, 'META_RAW_DB_PASSWORD'),
    max: Number(env.META_RAW_DB_POOL_SIZE ?? 5),
    connectionTimeoutMillis: Number(env.META_RAW_DB_CONNECTION_TIMEOUT_MS ?? 5000),
    statement_timeout: Number(env.META_RAW_DB_STATEMENT_TIMEOUT_MS ?? 10000),
    application_name: 'meta-raw-dashboard',
    ssl: { ca, rejectUnauthorized: true },
  });
}

export async function closeDbPool(pool) {
  if (pool) await pool.end();
}
