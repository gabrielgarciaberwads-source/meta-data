import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardApi } from '../src/dashboard-api.mjs';

function fakeDb(responses = []) {
  const calls = [];
  return {
    calls,
    async query(text, values) {
      calls.push({ text, values });
      return { rows: responses.shift() ?? [] };
    },
  };
}

async function request(api, path) {
  const response = await api({ method: 'GET', url: path });
  return { ...response, json: JSON.parse(response.body) };
}

test('dashboard rejects incomplete or reversed date filters', async () => {
  const api = createDashboardApi({ db: fakeDb() });

  const missing = await request(api, '/api/dashboard/summary?period_start=2026-10-01&period_end=2026-10-05');
  assert.equal(missing.status, 400);
  assert.equal(missing.json.error.code, 'MISSING_ACCOUNT_FILTER');

  const reversed = await request(api, '/api/dashboard/summary?period_start=2026-10-05&period_end=2026-10-01&organic_account_id=17841449595671459&ad_account_id=act_277127183253232');
  assert.equal(reversed.status, 400);
  assert.equal(reversed.json.error.code, 'INVALID_PERIOD');
});

test('summary preserves zero, unavailable states, channel separation, and sanitization', async () => {
  const db = fakeDb([
    [{ media_count: 0, stories_count: 0, collaborators_count: 0 }],
    [{ metric_name: 'reach', metric_value: 0, metric_status: 'AVAILABLE', observed_at: '2026-10-05T12:00:00.000Z' }],
    [{ campaign_count: 0, adset_count: 0, ad_count: 0, creative_count: 0 }],
    [],
    [{ status: 'SUCCEEDED', finished_at: '2026-10-05T12:00:00.000Z', period_start: '2026-09-05', period_end: '2026-10-05' }],
    [],
  ]);
  const api = createDashboardApi({ db });
  const response = await request(api, '/api/dashboard/summary?period_start=2026-09-05&period_end=2026-10-05&organic_account_id=17841449595671459&ad_account_id=act_277127183253232');

  assert.equal(response.status, 200);
  assert.equal(response.json.organic.status, 'AVAILABLE');
  assert.equal(response.json.organic.metrics[0].value, 0);
  assert.equal(response.json.paid.status, 'NOT_VALIDATED');
  assert.equal(response.json.paid.metrics.length, 0);
  assert.equal(response.json.organic.channel, 'ORGANIC');
  assert.equal(response.json.paid.channel, 'PAID');
  assert.equal(JSON.stringify(response.json).includes('raw_payload'), false);
  assert.equal(JSON.stringify(response.json).includes('password'), false);
});

test('health is no-store and uses a safe normalized error', async () => {
  const db = { async query() { throw new Error('password=should-not-leak'); } };
  const api = createDashboardApi({ db });
  const response = await request(api, '/api/health');

  assert.equal(response.status, 503);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.json, { error: { code: 'DATABASE_UNAVAILABLE', message: 'Dashboard data is temporarily unavailable.' } });
  assert.equal(response.body.includes('password'), false);
});
