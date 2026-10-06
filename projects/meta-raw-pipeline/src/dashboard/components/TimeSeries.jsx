import { useEffect, useMemo, useState } from 'react';
import { MetricChart } from './MetricChart.jsx';
import { StatusBadge } from './StatusBadge.jsx';
import { formatValue } from './MetricCard.jsx';

function labelFor(name) {
  return String(name ?? '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function definitionFor(definitions, name) {
  return definitions.find((definition) => definition.metricName === name) ?? null;
}

function chartPoints(rows, aggregationType) {
  const byDate = new Map();
  rows.forEach((row) => {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  });

  return [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, dateRows]) => {
    const available = dateRows.filter((row) => row.status === 'AVAILABLE' && row.value !== null);
    if (aggregationType === 'ADDITIVE') {
      return { date, value: available.length ? available.reduce((total, row) => total + row.value, 0) : null };
    }
    return { date, value: dateRows.length === 1 && dateRows[0].status === 'AVAILABLE' ? dateRows[0].value : null };
  });
}

function periodSummary(points) {
  const valid = points.filter((point) => point.value !== null && Number.isFinite(point.value));
  if (!valid.length) return { best: null, worst: null };
  return {
    best: valid.reduce((best, point) => point.value > best.value ? point : best, valid[0]),
    worst: valid.reduce((worst, point) => point.value < worst.value ? point : worst, valid[0]),
  };
}

export function TimeSeries({ series = [], comparisonSeries = [], definitions = [] }) {
  const metricNames = useMemo(() => [...new Set(series.map((item) => item.name))], [series]);
  const availableNames = useMemo(() => metricNames.filter((name) => series.some((item) => item.name === name && item.status === 'AVAILABLE' && item.value !== null)), [metricNames, series]);
  const [selectedMetric, setSelectedMetric] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!availableNames.includes(selectedMetric)) setSelectedMetric(availableNames[0] ?? metricNames[0] ?? '');
  }, [availableNames, metricNames, selectedMetric]);

  if (!series.length) return <p className="empty-state">No validated observations for this period.</p>;

  const selectedDefinition = definitionFor(definitions, selectedMetric);
  const selectedRows = series.filter((item) => item.name === selectedMetric);
  const comparisonRows = comparisonSeries.filter((item) => item.name === selectedMetric);
  const points = chartPoints(selectedRows, selectedDefinition?.aggregationType);
  const comparisonPoints = chartPoints(comparisonRows, selectedDefinition?.aggregationType);
  const summary = periodSummary(points);
  const comparisonSummary = periodSummary(comparisonPoints);
  const visibleRows = showAll ? series : selectedRows;

  return (
    <div className="timeseries-module">
      <div className="chart-toolbar">
        <label className="metric-select">Metric to chart
          <select value={selectedMetric} onChange={(event) => setSelectedMetric(event.target.value)} aria-label="Metric to chart">
            {metricNames.map((name) => <option key={name} value={name}>{labelFor(name)}</option>)}
          </select>
        </label>
        <div className="chart-status"><StatusBadge status={selectedDefinition?.aggregationType === 'ADDITIVE' ? 'AVAILABLE' : (selectedRows.some((row) => row.value !== null) ? 'AVAILABLE' : 'UNAVAILABLE')} /><span>{selectedDefinition?.aggregationType === 'ADDITIVE' ? 'Values are summed across compatible rows.' : 'Only directly observed values are plotted.'}</span></div>
      </div>
      <div className="chart-layout">
        <div className="chart-panel">
          <MetricChart points={points} comparisonPoints={comparisonPoints} label={labelFor(selectedMetric)} comparisonLabel="Previous period" />
          <div className="chart-summary">
            <div><span>Best day</span><strong>{summary.best ? `${summary.best.date} · ${formatValue(summary.best.value)}` : '—'}</strong></div>
            <div><span>Lowest day</span><strong>{summary.worst ? `${summary.worst.date} · ${formatValue(summary.worst.value)}` : '—'}</strong></div>
            <div><span>Previous best</span><strong>{comparisonSummary.best ? `${comparisonSummary.best.date} · ${formatValue(comparisonSummary.best.value)}` : '—'}</strong></div>
            <div><span>Previous lowest</span><strong>{comparisonSummary.worst ? `${comparisonSummary.worst.date} · ${formatValue(comparisonSummary.worst.value)}` : '—'}</strong></div>
          </div>
        </div>
        <aside className="metric-explainer">
          <p className="eyebrow">How to read it</p>
          <h3>{labelFor(selectedMetric)}</h3>
          <p>{selectedDefinition?.definition ?? 'This metric has no definition registered yet.'}</p>
          {selectedDefinition?.notes ? <p className="metric-note">{selectedDefinition.notes}</p> : null}
          <dl>
            <div><dt>Aggregation</dt><dd>{selectedDefinition?.aggregationType ?? 'UNKNOWN'}</dd></div>
            <div><dt>Rows in period</dt><dd>{selectedRows.length}</dd></div>
          </dl>
        </aside>
      </div>
      <div className="table-heading"><div><p className="eyebrow">Evidence table</p><h3>{showAll ? 'All observations' : `${labelFor(selectedMetric)} observations`}</h3></div><button className="text-button" type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show selected metric' : 'Show all metrics'}</button></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Metric</th><th>Value</th><th>Status</th><th>Dimensions</th></tr></thead>
          <tbody>
            {visibleRows.map((item, index) => (
              <tr key={`${item.date}-${item.name}-${index}`}>
                <td>{item.date}</td>
                <td>{labelFor(item.name)}</td>
                <td>{item.value === null ? '—' : formatValue(item.value)}</td>
                <td><StatusBadge status={item.status} /></td>
                <td>{item.dimensions ? [item.dimensions.publisherPlatform, item.dimensions.platformPosition].filter(Boolean).join(' / ') || '—' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
