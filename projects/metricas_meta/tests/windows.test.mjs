import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.mjs';
import { getWindow } from '../src/windows.mjs';

const fixedNow = new Date('2026-08-03T18:42:00Z');

test('returns adjacent seven-day UTC weekly windows', () => {
  assert.deepEqual(getWindow('weekly', fixedNow), {
    kind: 'weekly',
    current: { start: '2026-07-27', end: '2026-08-03' },
    previous: { start: '2026-07-20', end: '2026-07-27' },
  });
});

test('returns two adjacent rolling thirty-day monthly windows', () => {
  assert.deepEqual(getWindow('monthly', fixedNow), {
    kind: 'monthly',
    current: { start: '2026-07-04', end: '2026-08-03' },
    previous: { start: '2026-06-04', end: '2026-07-04' },
  });
});

test('rejects unknown window kinds', () => {
  assert.throws(() => getWindow('daily', fixedNow), /Unknown window kind/);
});

const completeEnv = {
  META_ACCESS_TOKEN: 'token',
  META_GRAPH_API_VERSION: 'v23.0',
  META_IG_USER_ID: 'ig-user',
  META_AD_ACCOUNT_ID: 'ad-account',
  PRESENTON_BASE_URL: 'http://localhost:5000/',
};

test('requires all mandatory environment variables', () => {
  for (const name of [
    'META_ACCESS_TOKEN',
    'META_GRAPH_API_VERSION',
    'META_IG_USER_ID',
    'META_AD_ACCOUNT_ID',
    'PRESENTON_BASE_URL',
  ]) {
    const env = { ...completeEnv };
    delete env[name];
    assert.throws(() => loadConfig(env), new RegExp(name));
  }
});

test('applies safe defaults and leaves the API key optional', () => {
  assert.deepEqual(loadConfig(completeEnv), {
    metaAccessToken: 'token',
    metaGraphApiVersion: 'v23.0',
    metaIgUserId: 'ig-user',
    metaAdAccountId: 'ad-account',
    presentonBaseUrl: 'http://localhost:5000',
    presentonApiKey: null,
    presentonTimeoutMs: 180000,
    presentonTemplate: 'general',
    presentonExportAs: 'pptx',
    outputDir: 'data/output',
    dataDir: 'data',
  });
});

test('rejects non-local Presenton URLs', () => {
  assert.throws(
    () => loadConfig({ ...completeEnv, PRESENTON_BASE_URL: 'https://presenton.example.com' }),
    /loopback host/,
  );
});
