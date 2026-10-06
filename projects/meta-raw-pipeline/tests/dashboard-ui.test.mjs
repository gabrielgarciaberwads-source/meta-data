import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('Ownerinc dashboard includes the approved views and explicit availability states', async () => {
  const main = await readProjectFile('src/dashboard/main.jsx');
  const status = await readProjectFile('src/dashboard/components/StatusBadge.jsx');
  const metricCard = await readProjectFile('src/dashboard/components/MetricCard.jsx');
  const timeseries = await readProjectFile('src/dashboard/components/TimeSeries.jsx');
  const chart = await readProjectFile('src/dashboard/components/MetricChart.jsx');
  const styles = await readProjectFile('src/dashboard/styles.css');

  for (const label of ['Overview', 'Organic', 'Paid', 'Quality', 'NOT_VALIDATED', 'PARTIAL', 'Best available signal', 'Where to look carefully', 'Trend and metric guide', 'Performance, with provenance', 'Current period', 'Previous period', 'Metric library', 'NOT_CONNECTED']) {
    assert.match(main, new RegExp(label));
  }
  assert.match(status, /UNAVAILABLE/);
  assert.match(metricCard, /previousValue/);
  assert.match(metricCard, /metric-delta/);
  assert.match(timeseries, /Show all metrics/);
  assert.match(timeseries, /Best day/);
  assert.match(timeseries, /comparisonSeries/);
  assert.match(chart, /role="img"/);
  assert.match(chart, /comparisonPoints/);
  assert.match(chart, /metric-chart-previous/);
  assert.match(main, /fetch\(\`\$\{path\}/);
  assert.match(main, /'\/api\/dashboard\/summary'/);
  assert.doesNotMatch(main, /raw_payload|DATABASE_URL|password/i);
  assert.doesNotMatch(styles, /gradient/i);
  assert.match(styles, /#070a0d/);
  assert.match(styles, /#68e4df/);
  assert.match(styles, /#ff776d/);
  assert.match(styles, /prefers-reduced-motion/);
});
