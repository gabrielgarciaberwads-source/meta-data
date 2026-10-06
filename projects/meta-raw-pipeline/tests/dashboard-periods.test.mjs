import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonLabel, getPeriodRange, getPreviousRange, periodLabel } from '../src/dashboard/periods.mjs';

test('week is an inclusive seven-day range ending on the anchor date', () => {
  assert.deepEqual(getPeriodRange('WEEK', new Date('2026-10-06T12:00:00Z')), {
    mode: 'WEEK', start: '2026-09-30', end: '2026-10-06',
  });
});

test('month is an inclusive thirty-day range and previous range is adjacent', () => {
  const current = getPeriodRange('MONTH', new Date('2026-10-06T12:00:00Z'));
  assert.deepEqual(current, { mode: 'MONTH', start: '2026-09-07', end: '2026-10-06' });
  assert.deepEqual(getPreviousRange(current), { mode: 'CUSTOM', start: '2026-08-08', end: '2026-09-06' });
});

test('custom previous range preserves duration and labels', () => {
  const current = { mode: 'CUSTOM', start: '2026-10-01', end: '2026-10-05' };
  const previous = getPreviousRange(current);
  assert.deepEqual(previous, { mode: 'CUSTOM', start: '2026-09-26', end: '2026-09-30' });
  assert.equal(periodLabel('CUSTOM'), 'Custom');
  assert.equal(comparisonLabel(current, previous), '2026-10-01 → 2026-10-05 vs 2026-09-26 → 2026-09-30');
});

test('invalid custom dates remain visible for the API to reject safely', () => {
  assert.deepEqual(getPreviousRange({ mode: 'CUSTOM', start: '', end: '2026-10-05' }), {
    mode: 'CUSTOM', start: '', end: '2026-10-05',
  });
  assert.deepEqual(getPreviousRange({ mode: 'CUSTOM', start: '2026-10-05', end: '2026-10-01' }), {
    mode: 'CUSTOM', start: '2026-10-05', end: '2026-10-01',
  });
});
