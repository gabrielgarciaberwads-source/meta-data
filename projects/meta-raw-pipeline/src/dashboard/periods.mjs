const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(value) {
  return new Date(`${value}T00:00:00Z`);
}

function iso(value) {
  return value.toISOString().slice(0, 10);
}

function shift(value, days) {
  return new Date(dateOnly(value).getTime() + days * DAY_MS);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && !Number.isNaN(dateOnly(value).valueOf());
}

export function getPeriodRange(mode, anchorDate = new Date()) {
  const normalizedMode = ['WEEK', 'MONTH'].includes(mode) ? mode : 'WEEK';
  const end = new Date(anchorDate);
  const days = normalizedMode === 'MONTH' ? 30 : 7;
  const start = new Date(end.getTime() - (days - 1) * DAY_MS);
  return { mode: normalizedMode, start: iso(start), end: iso(end) };
}

export function getPreviousRange({ start, end }) {
  if (!validDate(start) || !validDate(end) || end < start) return { mode: 'CUSTOM', start, end };
  const duration = Math.round((dateOnly(end) - dateOnly(start)) / DAY_MS) + 1;
  return { mode: 'CUSTOM', start: iso(shift(start, -duration)), end: iso(shift(start, -1)) };
}

export function periodLabel(mode) {
  return mode === 'WEEK' ? 'Week' : mode === 'MONTH' ? 'Month' : 'Custom';
}

export function comparisonLabel(current, previous) {
  return `${current.start} → ${current.end} vs ${previous.start} → ${previous.end}`;
}
