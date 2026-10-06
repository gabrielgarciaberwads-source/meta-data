import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefinitions, getQuality, getTimeseries } from '../src/dashboard-queries.mjs';

function fakeDb(rows = []) {
  const calls = [];
  return {
    calls,
    async query(text, values) {
      calls.push({ text, values });
      return { rows: rows.shift() ?? [] };
    },
  };
}

test('timeseries is parameterized and never selects raw payloads', async () => {
  const db = fakeDb([[{
    observation_date: '2026-10-05',
    metric_name: 'reach',
    metric_value: 0,
    metric_status: 'AVAILABLE',
  }]]);
  const result = await getTimeseries(db, {
    channel: 'ORGANIC',
    periodStart: '2026-09-05',
    periodEnd: '2026-10-05',
    organicAccountId: '17841449595671459',
  });

  assert.equal(result.channel, 'ORGANIC');
  assert.equal(result.series[0].value, 0);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].text, /\$1/);
  assert.match(db.calls[0].text, /\$2/);
  assert.match(db.calls[0].text, /\$3/);
  assert.match(db.calls[0].text, /aggregation_type/);
  assert.doesNotMatch(db.calls[0].text, /raw_payload|SELECT \*/i);
  assert.deepEqual(db.calls[0].values, ['17841449595671459', '2026-09-05', '2026-10-05']);
});

test('definitions and quality expose only approved fields', async () => {
  const db = fakeDb([
    [{ metric_name: 'reach', source: 'instagram', channel: 'ORGANIC', definition: 'People reached', aggregation_type: 'NON_ADDITIVE', notes: null }],
    [{ collection_run_id: 'run-1', workflow_name: 'C1', source: 'instagram.media', status: 'SUCCEEDED', period_start: '2026-09-05', period_end: '2026-10-05', records_requested: 0, records_received: 8, records_inserted: 0, records_updated: 8, error_count: 0, finished_at: '2026-10-05T12:00:00.000Z' }],
    [{ collection_run_id: 'run-1', workflow_name: 'C1', status: 'SUCCESS', http_status: 200, error_code: null, log_count: 1, error_count: 0 }],
  ]);
  const definitions = await getDefinitions(db, { channel: 'ORGANIC' });
  const quality = await getQuality(db, { periodStart: '2026-09-05', periodEnd: '2026-10-05' });

  assert.equal(definitions[0].aggregationType, 'NON_ADDITIVE');
  assert.equal(quality.runs[0].collectionRunId, 'run-1');
  assert.equal(quality.logs[0].errorCode, null);
  assert.doesNotMatch(JSON.stringify({ definitions, quality }), /raw_payload|error_message|password/i);
});
