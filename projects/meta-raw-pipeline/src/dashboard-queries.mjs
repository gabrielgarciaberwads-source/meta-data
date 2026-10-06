const ORGANIC_METRICS = `
  SELECT m.metric_name,
         CASE WHEN max(d.aggregation_type) = 'ADDITIVE'
              THEN SUM(m.metric_value_numeric) FILTER (WHERE m.metric_status = 'AVAILABLE')
              ELSE NULL END AS metric_value,
         CASE WHEN max(d.aggregation_type) = 'ADDITIVE'
                   AND bool_or(m.metric_status = 'AVAILABLE')
              THEN 'AVAILABLE'
              ELSE 'UNAVAILABLE' END AS metric_status,
         max(m.observed_at) AS observed_at
  FROM meta_raw.instagram_organic_metrics m
  LEFT JOIN meta_raw.metric_definitions d
    ON d.metric_name = m.metric_name AND d.channel = 'ORGANIC'
  WHERE m.account_id = $1
    AND m.observed_at >= $2::date
    AND m.observed_at < ($3::date + interval '1 day')
  GROUP BY m.metric_name
  ORDER BY m.metric_name`;

const PAID_METRICS = `
  SELECT m.metric_name,
         CASE WHEN max(d.aggregation_type) = 'ADDITIVE'
              THEN SUM(m.metric_value_numeric) ELSE NULL END AS metric_value,
         CASE WHEN max(d.aggregation_type) = 'ADDITIVE' AND count(*) > 0
              THEN 'AVAILABLE' ELSE 'UNAVAILABLE' END AS metric_status,
         max(m.date_stop) AS observed_at
  FROM meta_raw.meta_paid_metrics m
  LEFT JOIN meta_raw.metric_definitions d
    ON d.metric_name = m.metric_name AND d.channel = 'PAID'
  WHERE m.ad_account_id = $1
    AND m.date_start >= $2::date
    AND m.date_stop <= $3::date
  GROUP BY m.metric_name
  ORDER BY m.metric_name`;

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function statusFromRuns(rows) {
  if (!rows.length) return 'NOT_VALIDATED';
  const latest = rows[0];
  if (latest.status === 'SUCCEEDED') return 'AVAILABLE';
  if (latest.status === 'PARTIAL') return 'PARTIAL';
  return 'PARTIAL';
}

function metric(row) {
  const value = numeric(row.metric_value);
  return {
    name: row.metric_name,
    value,
    status: row.metric_status ?? (value === null ? 'UNAVAILABLE' : 'AVAILABLE'),
    observedAt: row.observed_at ?? null,
  };
}

function coverage(rows) {
  const latest = rows[0];
  return latest
    ? { periodStart: latest.period_start ?? null, periodEnd: latest.period_end ?? null }
    : { periodStart: null, periodEnd: null };
}

function warningList(rows) {
  return rows
    .filter((row) => row.status !== 'SUCCEEDED')
    .map((row) => ({ status: row.status, errorCount: Number(row.error_count ?? 0) }));
}

function runQuery(db, text, values) {
  return db.query(text, values).then((result) => result.rows);
}

export async function getSummary(db, { periodStart, periodEnd, organicAccountId, adAccountId }) {
  const [organicEntities, organicMetrics, paidEntities, paidMetrics, organicRuns, paidRuns] = await Promise.all([
    runQuery(db, `
      SELECT
        (SELECT count(*)::integer FROM meta_raw.instagram_media
         WHERE account_id = $1 AND published_at >= $2::date
           AND published_at < ($3::date + interval '1 day')) AS media_count,
        (SELECT count(*)::integer FROM meta_raw.instagram_stories
         WHERE account_id = $1 AND published_at >= $2::date
           AND published_at < ($3::date + interval '1 day')) AS stories_count,
        (SELECT count(*)::integer FROM meta_raw.instagram_media_collaborators
         WHERE account_id = $1) AS collaborators_count`,
      [organicAccountId, periodStart, periodEnd],
    ),
    runQuery(db, ORGANIC_METRICS, [organicAccountId, periodStart, periodEnd]),
    runQuery(db, `
      SELECT
        (SELECT count(*)::integer FROM meta_raw.meta_campaigns WHERE ad_account_id = $1) AS campaign_count,
        (SELECT count(*)::integer FROM meta_raw.meta_adsets WHERE ad_account_id = $1) AS adset_count,
        (SELECT count(*)::integer FROM meta_raw.meta_ads WHERE ad_account_id = $1) AS ad_count,
        (SELECT count(*)::integer FROM meta_raw.meta_creatives WHERE ad_account_id = $1) AS creative_count`,
      [adAccountId],
    ),
    runQuery(db, PAID_METRICS, [adAccountId, periodStart, periodEnd]),
    runQuery(db, `
      SELECT status, period_start::text, period_end::text, finished_at, error_count
      FROM meta_raw.collection_runs
      WHERE source LIKE 'instagram%'
        AND (metadata->>'account_id' = $1 OR metadata->>'scope' LIKE 'organic%')
      ORDER BY started_at DESC
      LIMIT 20`,
      [organicAccountId],
    ),
    runQuery(db, `
      SELECT status, period_start::text, period_end::text, finished_at, error_count
      FROM meta_raw.collection_runs
      WHERE source LIKE 'meta%'
        AND (metadata->>'ad_account_id' = $1 OR metadata->>'account_id' = $1)
      ORDER BY started_at DESC
      LIMIT 20`,
      [adAccountId],
    ),
  ]);

  const organicEntity = organicEntities[0] ?? {};
  const paidEntity = paidEntities[0] ?? {};
  return {
    period: { start: periodStart, end: periodEnd },
    organic: {
      channel: 'ORGANIC',
      status: statusFromRuns(organicRuns),
      counts: {
        media: Number(organicEntity.media_count ?? 0),
        stories: Number(organicEntity.stories_count ?? 0),
        collaborators: Number(organicEntity.collaborators_count ?? 0),
      },
      metrics: organicMetrics.map(metric),
      observedAt: organicMetrics[0]?.observed_at ?? organicRuns[0]?.finished_at ?? null,
      coverage: coverage(organicRuns),
      warnings: warningList(organicRuns),
    },
    paid: {
      channel: 'PAID',
      status: statusFromRuns(paidRuns),
      counts: {
        campaigns: Number(paidEntity.campaign_count ?? 0),
        adsets: Number(paidEntity.adset_count ?? 0),
        ads: Number(paidEntity.ad_count ?? 0),
        creatives: Number(paidEntity.creative_count ?? 0),
      },
      metrics: paidMetrics.map(metric),
      observedAt: paidMetrics[0]?.observed_at ?? paidRuns[0]?.finished_at ?? null,
      coverage: coverage(paidRuns),
      warnings: warningList(paidRuns),
    },
  };
}

export async function getTimeseries(db, { channel, periodStart, periodEnd, organicAccountId, adAccountId }) {
  const values = channel === 'ORGANIC'
    ? [organicAccountId, periodStart, periodEnd]
    : [adAccountId, periodStart, periodEnd];
  const text = channel === 'ORGANIC'
    ? `
      SELECT m.observed_at::date::text AS observation_date, m.metric_name,
             CASE WHEN max(d.aggregation_type) = 'ADDITIVE'
                  THEN SUM(m.metric_value_numeric) FILTER (WHERE m.metric_status = 'AVAILABLE')
                  ELSE NULL END AS metric_value,
             CASE WHEN max(d.aggregation_type) = 'ADDITIVE'
                       AND bool_or(m.metric_status = 'AVAILABLE')
                  THEN 'AVAILABLE' ELSE 'UNAVAILABLE' END AS metric_status
      FROM meta_raw.instagram_organic_metrics m
      LEFT JOIN meta_raw.metric_definitions d
        ON d.metric_name = m.metric_name AND d.channel = 'ORGANIC'
      WHERE m.account_id = $1 AND m.observed_at >= $2::date
        AND m.observed_at < ($3::date + interval '1 day')
      GROUP BY m.observed_at::date, m.metric_name
      ORDER BY observation_date, metric_name`
    : `
      SELECT date_start::text AS observation_date, metric_name,
             SUM(metric_value_numeric) AS metric_value,
             'AVAILABLE' AS metric_status, publisher_platform, platform_position
      FROM meta_raw.meta_paid_metrics
      WHERE ad_account_id = $1 AND date_start >= $2::date AND date_stop <= $3::date
      GROUP BY date_start, metric_name, publisher_platform, platform_position
      ORDER BY observation_date, metric_name`;

  const rows = await runQuery(db, text, values);
  return {
    channel,
    series: rows.map((row) => ({
      date: row.observation_date,
      name: row.metric_name,
      value: numeric(row.metric_value),
      status: row.metric_status ?? 'UNAVAILABLE',
      dimensions: channel === 'PAID'
        ? { publisherPlatform: row.publisher_platform ?? null, platformPosition: row.platform_position ?? null }
        : undefined,
    })),
  };
}

export async function getDefinitions(db, { channel } = {}) {
  const values = channel ? [channel] : [];
  const filter = channel ? 'WHERE channel = $1' : '';
  const rows = await runQuery(db, `
    SELECT metric_name, source, channel, definition, aggregation_type, notes
    FROM meta_raw.metric_definitions
    ${filter}
    ORDER BY channel, metric_name`, values);
  return rows.map((row) => ({
    metricName: row.metric_name,
    source: row.source,
    channel: row.channel,
    definition: row.definition,
    aggregationType: row.aggregation_type,
    notes: row.notes ?? null,
  }));
}

export async function getQuality(db, { periodStart, periodEnd } = {}) {
  const runs = await runQuery(db, `
    SELECT id::text AS collection_run_id, workflow_name, source, status,
           period_start::text, period_end::text, records_requested,
           records_received, records_inserted, records_updated, error_count,
           finished_at
    FROM meta_raw.collection_runs
    WHERE ($1::date IS NULL OR period_end IS NULL OR period_end >= $1::date)
      AND ($2::date IS NULL OR period_start IS NULL OR period_start <= $2::date)
    ORDER BY started_at DESC
    LIMIT 50`, [periodStart ?? null, periodEnd ?? null]);
  const logs = await runQuery(db, `
    SELECT collection_run_id::text, workflow_name, status, http_status,
           error_code, count(*)::integer AS log_count,
           count(*) FILTER (WHERE status = 'ERROR')::integer AS error_count
    FROM meta_raw.integration_logs
    GROUP BY collection_run_id, workflow_name, status, http_status, error_code
    ORDER BY max(started_at) DESC
    LIMIT 100`);

  return {
    runs: runs.map((row) => ({
      collectionRunId: row.collection_run_id,
      workflowName: row.workflow_name,
      source: row.source,
      status: row.status,
      periodStart: row.period_start ?? null,
      periodEnd: row.period_end ?? null,
      records: {
        requested: Number(row.records_requested ?? 0),
        received: Number(row.records_received ?? 0),
        inserted: Number(row.records_inserted ?? 0),
        updated: Number(row.records_updated ?? 0),
      },
      errorCount: Number(row.error_count ?? 0),
      finishedAt: row.finished_at ?? null,
    })),
    logs: logs.map((row) => ({
      collectionRunId: row.collection_run_id,
      workflowName: row.workflow_name,
      status: row.status,
      httpStatus: row.http_status ?? null,
      errorCode: row.error_code ?? null,
      logCount: Number(row.log_count ?? 0),
      errorCount: Number(row.error_count ?? 0),
    })),
  };
}
