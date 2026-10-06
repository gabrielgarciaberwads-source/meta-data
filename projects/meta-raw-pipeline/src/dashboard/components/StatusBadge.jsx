const labels = {
  AVAILABLE: 'Available',
  NOT_VALIDATED: 'Not validated',
  PARTIAL: 'Partial',
  UNAVAILABLE: 'Unavailable',
  INSUFFICIENT_VIEWERS: 'Insufficient viewers',
  ERROR: 'Error',
};

export function StatusBadge({ status = 'UNAVAILABLE' }) {
  return <span className={`status status-${status.toLowerCase()}`}>{labels[status] ?? status}</span>;
}
