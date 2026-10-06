import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadConfig, loadEnvFile } from '../src/config.mjs';

test('loads documented .env values without overriding the process environment', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'instagram-env-'));
  const file = join(dir, '.env');
  try {
    await writeFile(file, 'META_ACCESS_TOKEN=file-token\nPRESENTON_BASE_URL="http://localhost:3000"\n');
    const env = { META_ACCESS_TOKEN: 'process-token' };
    loadEnvFile(env, file);
    assert.equal(env.META_ACCESS_TOKEN, 'process-token');
    assert.equal(loadConfig({ ...env, META_GRAPH_API_VERSION: 'v23.0', META_IG_USER_ID: 'ig', META_AD_ACCOUNT_ID: 'ad' }).presentonBaseUrl, 'http://localhost:3000');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
