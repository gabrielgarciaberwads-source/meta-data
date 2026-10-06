import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('live QA runbook covers only the approved workflows and safe evidence', async () => {
  const runbook = await readProjectFile('docs/qa-live-runbook.md');
  for (const workflowId of [
    '6Lu7bCvKPMMJKkfE',
    'F5wU8CN34kHSYfqd',
    'NJ3gwPPWyUMAQTPM',
    'txQorqTsuTEPasfb',
    'RZx96pisAg2i9DaQ',
    'lOJbgByhiMzdOTNq',
  ]) {
    assert.match(runbook, new RegExp(workflowId));
  }
  assert.match(runbook, /manual/i);
  assert.match(runbook, /inactive/i);
  assert.match(runbook, /unpublished/i);
  assert.match(runbook, /collection_run_id/);
  assert.match(runbook, /integration_logs/);
  assert.match(runbook, /Do not download execution data/);
  assert.match(runbook, /GitHub/);
  assert.match(runbook, /raw_payload/);
  assert.match(runbook, /idempotency/i);
});

test('live QA report starts without production fixtures or payloads', async () => {
  const report = await readProjectFile('docs/qa-live-report.md');

  assert.match(report, /NOT_RUN/);
  assert.match(report, /aggregate evidence/i);
  assert.doesNotMatch(report, /raw_payload\s*[:=]\s*[{"']/i);
  assert.doesNotMatch(report, /access_token\s*[:=]/i);
  assert.doesNotMatch(report, /password\s*[:=]/i);
  assert.doesNotMatch(report, /\b\d+\.\d{2}\b/);
});
