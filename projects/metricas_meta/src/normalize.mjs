import { correlatePaidToMedia } from './correlate.mjs';

const METRIC_NAMES = new Set([
  'impressions',
  'reach',
  'engagement',
  'engagements',
  'likes',
  'comments',
  'shares',
  'saves',
  'clicks',
  'link_clicks',
  'video_views',
  'replies',
  'follows',
  'profile_visits',
  'spend',
  'amount_spent',
  'frequency',
  'accounts_engaged',
  'total_interactions',
  'profile_views',
  'website_clicks',
  'profile_links_taps',
  'follower_count',
  'follower_growth',
  'unfollows',
  'reposts',
]);

const ACCOUNT_METRIC_NAMES = [
  'reach', 'impressions', 'views', 'follows', 'unfollows', 'accounts_engaged',
  'total_interactions', 'profile_views', 'website_clicks', 'profile_links_taps',
  'likes', 'comments', 'shares', 'saves', 'replies', 'reposts', 'follower_count',
  'follower_growth',
];

const META_FIELDS = new Set([
  'id',
  'media_id',
  'mediaId',
  'external_id',
  'externalId',
  'timestamp',
  'created_time',
  'createdTime',
  'permalink',
  'media_type',
  'mediaType',
  'type',
  'caption',
  'name',
  'ad_id',
  'adId',
  'campaign_id',
  'campaignId',
  'adset_id',
  'adsetId',
  'creative',
  'promoted_object',
  'promotedObject',
]);

function metricEntries(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).filter(([key, entry]) => (
    !META_FIELDS.has(key) && (METRIC_NAMES.has(key) || typeof entry === 'number' || typeof entry === 'string' || entry == null)
  ));
}

function parseMetric(value, path, warnings) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    warnings.push(`${path}: unavailable metric`);
    return null;
  }
  if (typeof value === 'boolean') {
    warnings.push(`${path}: malformed metric`);
    return null;
  }
  const number = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isFinite(number)) {
    warnings.push(`${path}: malformed metric`);
    return null;
  }
  if (number < 0) {
    warnings.push(`${path}: negative metric rejected`);
    return null;
  }
  return number;
}

function normalizeMetrics(value, path, warnings) {
  const result = {};
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.name === 'string') {
        const values = Array.isArray(entry.values) ? entry.values : [];
        result[entry.name] = parseMetric(values.at(-1)?.value, `${path}.${entry.name}`, warnings);
      } else {
        Object.assign(result, normalizeMetrics(entry, `${path}[${index}]`, warnings));
      }
    }
    return result;
  }
  if (value && typeof value === 'object' && typeof value.name === 'string' && 'values' in value) {
    const values = Array.isArray(value.values) ? value.values : [];
    result[value.name] = parseMetric(values.at(-1)?.value, `${path}.${value.name}`, warnings);
    return result;
  }
  for (const [key, entry] of metricEntries(value)) {
    result[key] = parseMetric(entry, `${path}.${key}`, warnings);
  }
  return result;
}

function sourceId(value) {
  return value?.externalId ?? value?.external_id ?? value?.media_id ?? value?.mediaId ?? value?.id ?? null;
}

function captionMetadata(caption) {
  const text = typeof caption === 'string' ? caption : '';
  return { hasText: text.length > 0, length: text.length };
}

function totalMetrics(organic, paid) {
  const total = {};
  const keys = new Set([...Object.keys(organic), ...Object.keys(paid)]);
  for (const key of keys) {
    total[key] = Number.isFinite(organic[key]) && Number.isFinite(paid[key])
      ? organic[key] + paid[key]
      : null;
  }
  return total;
}

function normalizeAccountMetrics(insights, warnings) {
  const result = Object.fromEntries(ACCOUNT_METRIC_NAMES.map((name) => [name, null]));
  for (const insight of Array.isArray(insights) ? insights : []) {
    const name = insight?.requested_metric ?? insight?.name;
    if (name === 'follows_and_unfollows') {
      const values = Array.isArray(insight.values)
        ? insight.values
        : insight.total_value ? [insight.total_value] : [];
      for (const entry of values) {
        const value = entry?.value;
        if (!value || typeof value !== 'object') continue;
        for (const metric of ['follows', 'unfollows']) {
          const parsed = parseMetric(value[metric], `account.${metric}`, warnings);
          if (parsed !== null) result[metric] = (result[metric] ?? 0) + parsed;
        }
      }
      continue;
    }
    if (!name || !(name in result)) continue;
    const values = Array.isArray(insight.values)
      ? insight.values
      : insight.total_value ? [insight.total_value] : [insight.value ?? insight.values];
    const numbers = values.map((entry) => parseMetric(
      entry && typeof entry === 'object' && !Array.isArray(entry) && 'value' in entry ? entry.value : entry,
      `account.${name}`,
      warnings,
    ))
      .filter((value) => value !== null);
    if (numbers.length) result[name] = name === 'follower_count' ? numbers.at(-1) : numbers.reduce((sum, value) => sum + value, 0);
  }
  if (Number.isFinite(result.follows) && Number.isFinite(result.unfollows)) {
    result.follower_growth = result.follows - result.unfollows;
  } else {
    result.follower_growth = null;
    warnings.push('account.follower_growth: unavailable metric (requires follows and unfollows)');
  }
  return result;
}

export function normalizeMetaSnapshot({
  posts = [],
  organicInsights = [],
  paidInsights = [],
  accountInsights = [],
  accountEnabled = false,
  window = null,
  collectedAt = null,
  warnings: suppliedWarnings = [],
} = {}) {
  const warnings = [...(Array.isArray(suppliedWarnings) ? suppliedWarnings : [])];
  const organicById = new Map();
  for (const insight of Array.isArray(organicInsights) ? organicInsights : []) {
    const id = sourceId(insight);
    if (id) {
      const existing = organicById.get(id);
      organicById.set(id, existing ? (Array.isArray(existing) ? [...existing, insight] : [existing, insight]) : insight);
    }
  }

  const normalizedPosts = (Array.isArray(posts) ? posts : []).map((post, index) => {
    const externalId = sourceId(post);
    const organicSource = organicById.get(externalId) ?? {};
    const organic = normalizeMetrics(organicSource, `posts[${index}].organic`, warnings);
    return {
      externalId,
      timestamp: post?.timestamp ?? post?.created_time ?? post?.createdTime ?? null,
      permalink: post?.permalink ?? null,
      mediaType: post?.media_type ?? post?.mediaType ?? post?.type ?? null,
      caption: captionMetadata(post?.caption),
      organic,
      paid: {},
      total: Object.fromEntries(Object.keys(organic).map((key) => [key, null])),
    };
  });

  const correlation = correlatePaidToMedia({ ads: paidInsights, posts: normalizedPosts });
  for (const match of correlation.matches) {
    const post = match.post;
    const index = normalizedPosts.indexOf(post);
    const paid = normalizeMetrics(match.ad, `posts[${index}].paid`, warnings);
    post.paid = paid;
    post.total = totalMetrics(post.organic, paid);
  }
  for (const record of correlation.unmatched) {
    warnings.push(`paid_unmatched: ${record.reason}`);
  }

  return {
    source: 'meta',
    collectedAt,
    window,
    posts: normalizedPosts,
    ...(accountEnabled ? { account: normalizeAccountMetrics(accountInsights, warnings) } : {}),
    correlations: {
      paid_unmatched: correlation.unmatched,
    },
    warnings,
  };
}

export function compareNormalizedPeriods(current = {}, previous = {}) {
  const currentTotals = {
    organic: totalPeriodMetrics(current.posts, 'organic'),
    paid: totalPeriodMetrics(current.posts, 'paid'),
  };
  const previousTotals = {
    organic: totalPeriodMetrics(previous.posts, 'organic'),
    paid: totalPeriodMetrics(previous.posts, 'paid'),
  };
  const delta = {};
  for (const channel of ['organic', 'paid']) {
    delta[channel] = {};
    for (const metric of new Set([...Object.keys(currentTotals[channel]), ...Object.keys(previousTotals[channel])])) {
      const currentValue = currentTotals[channel][metric];
      const previousValue = previousTotals[channel][metric];
      delta[channel][metric] = Number.isFinite(currentValue) && Number.isFinite(previousValue)
        ? currentValue - previousValue
        : null;
    }
  }
  return { current: currentTotals, previous: previousTotals, delta };
}

function totalPeriodMetrics(posts = [], channel) {
  const totals = {};
  for (const post of Array.isArray(posts) ? posts : []) {
    for (const [metric, value] of finiteMetricEntries(post?.[channel])) totals[metric] = (totals[metric] ?? 0) + value;
  }
  return totals;
}

function finiteMetricEntries(metrics) {
  return Object.entries(metrics && typeof metrics === 'object' ? metrics : {})
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value));
}
