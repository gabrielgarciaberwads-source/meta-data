function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function shiftUtcDate(date, days) {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

export function getWindow(kind, now = new Date()) {
  if (kind !== 'weekly' && kind !== 'monthly') {
    throw new Error(`Unknown window kind: ${kind}`);
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('now must be a valid Date');
  }

  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const currentStart = shiftUtcDate(end, kind === 'weekly' ? -7 : -30);
  const current = { start: formatUtcDate(currentStart), end: formatUtcDate(end) };

  const previousStart = shiftUtcDate(end, kind === 'monthly' ? -60 : -14);
  return {
    kind,
    current,
    previous: { start: formatUtcDate(previousStart), end: current.start },
  };
}
