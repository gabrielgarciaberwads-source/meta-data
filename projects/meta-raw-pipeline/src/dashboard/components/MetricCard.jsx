import { StatusBadge } from './StatusBadge.jsx';

function formatValue(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
}

export function MetricCard({ label, value, previousValue, status, note, description, aggregationType, deltaLabel }) {
  return (
    <article className="metric-card">
      <div className="metric-card-head">
        <span>{label}</span>
        <StatusBadge status={status} />
      </div>
      <strong>{formatValue(value)}</strong>
      {deltaLabel ? <span className="metric-delta">{deltaLabel}</span> : null}
      {note ? <small>{note}</small> : null}
      {description ? <p className="metric-description">{description}</p> : null}
      {aggregationType ? <span className="metric-aggregation">{aggregationType}</span> : null}
    </article>
  );
}

export { formatValue };
