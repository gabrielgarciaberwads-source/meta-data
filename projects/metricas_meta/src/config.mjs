const REQUIRED_ENV = [
  'META_ACCESS_TOKEN',
  'META_GRAPH_API_VERSION',
  'META_IG_USER_ID',
  'META_AD_ACCOUNT_ID',
  'PRESENTON_BASE_URL',
];

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function requiredValue(env, name) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function validatePresentonUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('PRESENTON_BASE_URL must be a valid local URL');
  }

  if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('PRESENTON_BASE_URL must use a loopback host');
  }

  return url.toString().replace(/\/$/, '');
}

function validateExportFormat(value) {
  const format = value?.trim() || 'pptx';
  if (format !== 'pptx') throw new Error('PRESENTON_EXPORT_AS must be pptx');
  return format;
}

function validateTimeout(value) {
  const timeout = Number(value?.trim() || 180000);
  if (!Number.isInteger(timeout) || timeout < 1000) throw new Error('PRESENTON_TIMEOUT_MS must be an integer of at least 1000');
  return timeout;
}

export function loadConfig(env = process.env) {
  return {
    metaAccessToken: requiredValue(env, 'META_ACCESS_TOKEN'),
    metaGraphApiVersion: requiredValue(env, 'META_GRAPH_API_VERSION'),
    metaIgUserId: requiredValue(env, 'META_IG_USER_ID'),
    metaAdAccountId: requiredValue(env, 'META_AD_ACCOUNT_ID'),
    presentonBaseUrl: validatePresentonUrl(requiredValue(env, 'PRESENTON_BASE_URL')),
    presentonApiKey: env.PRESENTON_API_KEY?.trim() || null,
    presentonTimeoutMs: validateTimeout(env.PRESENTON_TIMEOUT_MS),
    presentonTemplate: env.PRESENTON_TEMPLATE?.trim() || 'general',
    presentonExportAs: validateExportFormat(env.PRESENTON_EXPORT_AS),
    outputDir: env.OUTPUT_DIR?.trim() || 'data/output',
    dataDir: env.DATA_DIR?.trim() || 'data',
  };
}

export function loadEnvFile(env = process.env, filePath = resolve(dirname(fileURLToPath(import.meta.url)), '../.env')) {
  let contents;
  try {
    contents = readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return env;
    throw error;
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[2].startsWith('#')) continue;
    const value = match[2].trim().replace(/^("|')(.*)\1$/, '$2');
    if (env[match[1]] === undefined) env[match[1]] = value;
  }
  return env;
}
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
