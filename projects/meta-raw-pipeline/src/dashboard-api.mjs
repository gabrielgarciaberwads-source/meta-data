import { getDefinitions, getQuality, getSummary, getTimeseries } from './dashboard-queries.mjs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(status, body) {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function error(code, message, status = 400) {
  return json(status, { error: { code, message } });
}

function validDate(value) {
  if (!ISO_DATE.test(value ?? '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function filters(url) {
  const query = url.searchParams;
  const periodStart = query.get('period_start');
  const periodEnd = query.get('period_end');
  if (!validDate(periodStart) || !validDate(periodEnd)) throw Object.assign(new Error(), { code: 'INVALID_PERIOD' });
  if (periodEnd < periodStart) throw Object.assign(new Error(), { code: 'INVALID_PERIOD' });
  return {
    periodStart,
    periodEnd,
    organicAccountId: query.get('organic_account_id'),
    adAccountId: query.get('ad_account_id'),
  };
}

function requireAccount(channel, values) {
  if (channel === 'ORGANIC' && !values.organicAccountId) throw Object.assign(new Error(), { code: 'MISSING_ACCOUNT_FILTER' });
  if (channel === 'PAID' && !values.adAccountId) throw Object.assign(new Error(), { code: 'MISSING_ACCOUNT_FILTER' });
}

const messages = {
  INVALID_PERIOD: 'Use a valid inclusive period with period_end on or after period_start.',
  MISSING_ACCOUNT_FILTER: 'An explicit account filter is required for this channel.',
  INVALID_CHANNEL: 'Channel must be ORGANIC or PAID.',
};

function safeError(err) {
  const code = messages[err.code] ? err.code : 'DATABASE_UNAVAILABLE';
  const status = messages[err.code] ? 400 : 503;
  const message = messages[code] ?? 'Dashboard data is temporarily unavailable.';
  return error(code, message, status);
}

export function createDashboardApi({ db }) {
  return async function dashboardApi(request) {
    if (request.method !== 'GET') return json(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET is supported.' } });
    const url = new URL(request.url, 'http://dashboard.internal');
    try {
      if (url.pathname === '/api/health') {
        await db.query('SELECT 1');
        return json(200, { status: 'ok', service: 'meta-raw-dashboard' });
      }
      if (url.pathname === '/api/dashboard/summary') {
        const values = filters(url);
        if (!values.organicAccountId || !values.adAccountId) throw Object.assign(new Error(), { code: 'MISSING_ACCOUNT_FILTER' });
        return json(200, await getSummary(db, values));
      }
      if (url.pathname === '/api/dashboard/timeseries') {
        const values = filters(url);
        const channel = url.searchParams.get('channel');
        if (!['ORGANIC', 'PAID'].includes(channel)) throw Object.assign(new Error(), { code: 'INVALID_CHANNEL' });
        requireAccount(channel, values);
        return json(200, await getTimeseries(db, { ...values, channel }));
      }
      if (url.pathname === '/api/dashboard/definitions') {
        const channel = url.searchParams.get('channel');
        if (channel && !['ORGANIC', 'PAID'].includes(channel)) throw Object.assign(new Error(), { code: 'INVALID_CHANNEL' });
        return json(200, { definitions: await getDefinitions(db, { channel }) });
      }
      if (url.pathname === '/api/dashboard/quality') {
        const values = filters(url);
        return json(200, await getQuality(db, values));
      }
      return error('NOT_FOUND', 'Dashboard route not found.', 404);
    } catch (err) {
      return safeError(err);
    }
  };
}
