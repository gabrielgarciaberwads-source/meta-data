import { formatValue } from './MetricCard.jsx';

function pointFor(value, index, count, min, range) {
  const x = count === 1 ? 50 : (index / (count - 1)) * 100;
  const y = 100 - (((value - min) / range) * 78 + 11);
  return { x, y };
}

function pathFor(points) {
  let path = '';
  let started = false;
  points.forEach((point) => {
    if (!point) {
      started = false;
      return;
    }
    path += `${started ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)} `;
    started = true;
  });
  return path.trim();
}

function validPoints(points = []) {
  return points.map((point) => point.value === null || !Number.isFinite(point.value) ? null : point).filter(Boolean);
}

export function MetricChart({ points = [], comparisonPoints = [], label = 'Metric trend', comparisonLabel = 'Previous period' }) {
  const currentValues = validPoints(points);
  const previousValues = validPoints(comparisonPoints);
  const allValues = [...currentValues, ...previousValues].map((point) => point.value);
  if (!allValues.length) {
    return <p className="empty-state chart-empty">No validated observations for this metric and period.</p>;
  }

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || Math.max(Math.abs(max) * 0.1, 1);
  const coordinates = points.map((point, index) => point.value === null || !Number.isFinite(point.value) ? null : pointFor(point.value, index, points.length, min, range));
  const comparisonCoordinates = comparisonPoints.map((point, index) => point.value === null || !Number.isFinite(point.value) ? null : pointFor(point.value, index, comparisonPoints.length, min, range));
  const first = points.find((point) => point.value !== null) ?? points[0];
  const last = [...points].reverse().find((point) => point.value !== null) ?? points.at(-1);

  return <div className="chart-block">
    <div className="chart-meta" aria-hidden="true"><span>{formatValue(max)}</span><span>{formatValue(min)}</span></div>
    <svg className="metric-chart" viewBox="0 0 100 100" role="img" aria-label={`${label}, current period compared with ${comparisonLabel}`} preserveAspectRatio="none">
      <line x1="0" x2="100" y1="11" y2="11" /><line x1="0" x2="100" y1="50" y2="50" /><line x1="0" x2="100" y1="89" y2="89" />
      {comparisonCoordinates.length ? <path className="metric-chart-previous" d={pathFor(comparisonCoordinates)} /> : null}
      <path className="metric-chart-line" d={pathFor(coordinates)} />
      {coordinates.map((point, index) => point ? <circle key={`${points[index].date}-${index}`} cx={point.x} cy={point.y} r="1.8" /> : null)}
    </svg>
    <div className="chart-axis"><span>{first?.date ?? '—'}</span><span>{last?.date ?? '—'}</span></div>
    <div className="chart-legend"><span><i className="legend-current"></i>Current period</span><span><i className="legend-previous"></i>{comparisonLabel}</span></div>
  </div>;
}
