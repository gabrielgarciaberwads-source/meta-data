import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildBriefing as defaultBuildBriefing } from './briefing.mjs';
import { compareNormalizedPeriods, normalizeMetaSnapshot } from './normalize.mjs';
import { redact } from './redact.mjs';

const defaultFs = { mkdir, rename, unlink, writeFile };

function slideMarkdown(markdown) {
  return String(markdown)
    .split(/\r?\n(?=## )/)
    .filter((section) => section.startsWith('## '));
}

const safeText = redact;

const MONTHLY_ACCOUNT_METRICS = [
  { metric: 'reach' },
  { metric: 'impressions' },
  { metric: 'views', metric_type: 'total_value' },
  { metric: 'follows_and_unfollows', metric_type: 'total_value' },
  { metric: 'accounts_engaged', metric_type: 'total_value' },
  { metric: 'total_interactions', metric_type: 'total_value' },
  { metric: 'profile_views', metric_type: 'total_value' },
  { metric: 'website_clicks', metric_type: 'total_value' },
  { metric: 'profile_links_taps', metric_type: 'total_value' },
  { metric: 'likes', metric_type: 'total_value' },
  { metric: 'comments', metric_type: 'total_value' },
  { metric: 'shares', metric_type: 'total_value' },
  { metric: 'saves', metric_type: 'total_value' },
  { metric: 'replies', metric_type: 'total_value' },
  { metric: 'reposts', metric_type: 'total_value' },
  { metric: 'follower_count' },
];

function runIdFor(collectedAt) {
  return collectedAt.replace(/[^0-9]/g, '').slice(0, 14) || String(Date.now());
}

async function collectMonthlyAccountInsights({ metaClient, igUserId, period, label, warnings }) {
  const results = await Promise.all(MONTHLY_ACCOUNT_METRICS.map(async (spec) => {
    const { metric, ...metricQuery } = spec;
    try {
      const result = await metaClient.getAll(`/${igUserId}/insights`, {
        metric,
        ...metricQuery,
        period: 'day',
        since: period.start,
        until: period.end,
      });
      return { metric, result };
    } catch (error) {
      return { metric, error };
    }
  }));
  return results.flatMap(({ metric, result, error }) => {
    if (error) {
      warnings.push(`${label}: account metric ${metric} unavailable: ${safeText(error?.message ?? error, null)}`);
      return [];
    }
    if (!result.length) warnings.push(`${label}: account metric ${metric} returned no data (unsupported or permission-limited)`);
    return result.map((entry) => ({ ...entry, requested_metric: metric }));
  });
}

export async function collectSnapshot({ metaClient, config, window, collectedAt = new Date().toISOString(), onEvent = () => {} }) {
  if (!metaClient || typeof metaClient.getAll !== 'function') throw new TypeError('metaClient.getAll is required');
  if (!config?.metaIgUserId || !config?.metaAdAccountId) throw new TypeError('Meta account configuration is required');

  const warnings = [];
  const collectPeriod = async (period, label) => {
    let posts = [];
    let paidInsights = [];
    let accountInsights = [];
    try {
      const media = await metaClient.getAll(`/${config.metaIgUserId}/media`, { fields: 'id,timestamp,permalink,media_type,caption,media_product_type' });
      posts = media.filter((post) => {
        const timestamp = Date.parse(post?.timestamp ?? '');
        const start = Date.parse(`${period?.start}T00:00:00Z`);
        const end = Date.parse(`${period?.end}T00:00:00Z`);
        return Number.isFinite(timestamp) && timestamp >= start && timestamp < end;
      });
      if (!posts.length) warnings.push(`${label}: no media returned in the requested period`);
    } catch (error) {
      warnings.push(`${label}: media collection failed: ${safeText(error?.message ?? error, config.metaAccessToken)}`);
    }
    const organicInsights = [];
    await Promise.all(posts.map(async (post) => {
      const mediaId = post?.id ?? post?.media_id;
      if (!mediaId) {
        warnings.push(`${label}: media without id cannot collect insights`);
        return;
      }
      try {
        const insights = await metaClient.getAll(`/${mediaId}/insights`, { metric: 'reach,likes,comments,shares,saved,total_interactions,views' });
        if (!insights.length) warnings.push(`${label}: media ${mediaId} returned no insights (empty or permission-limited response)`);
        organicInsights.push(...insights.map((entry) => ({ ...entry, media_id: entry.media_id ?? mediaId })));
      } catch (error) {
        warnings.push(`${label}: media ${mediaId} insights failed: ${safeText(error?.message ?? error, config.metaAccessToken)}`);
      }
    }));
    try {
      paidInsights = await metaClient.getAll(`/${config.metaAdAccountId}/insights`, { fields: 'ad_id,impressions,reach,spend,clicks' });
      if (!paidInsights.length) warnings.push(`${label}: no account paid insights returned (empty or permission-limited response)`);
    } catch (error) {
      warnings.push(`${label}: paid collection failed: ${safeText(error?.message ?? error, config.metaAccessToken)}`);
    }
    if (window?.kind === 'monthly') {
      accountInsights = await collectMonthlyAccountInsights({
        metaClient,
        igUserId: config.metaIgUserId,
        period,
        label,
        warnings,
      });
    }
    const normalized = normalizeMetaSnapshot({
      posts,
      organicInsights,
      paidInsights,
      accountInsights,
      accountEnabled: window?.kind === 'monthly',
      window: { ...window, current: period },
      collectedAt,
    });
    return {
      ...normalized,
      metrics: {
        organic: organicInsights,
        paid: paidInsights,
        ...(window?.kind === 'monthly' ? { account: accountInsights } : {}),
      },
    };
  };

  const current = await collectPeriod(window?.current, 'current');
  const previous = window?.previous ? await collectPeriod(window.previous, 'previous') : null;
  onEvent('meta-collection');
  onEvent('normalization');
  return redact({
    ...current,
    periods: { current, previous },
    comparison: compareNormalizedPeriods(current, previous ?? {}),
    account: { instagramUserId: config.metaIgUserId, adAccountId: config.metaAdAccountId },
    collectedAt,
    window,
    warnings: [...warnings, ...current.warnings, ...(previous?.warnings ?? [])],
  }, config.metaAccessToken);
}

export async function persistSnapshot({ dataDir, runId, snapshot, fsImpl = defaultFs }) {
  const directory = join(dataDir, 'snapshots');
  await fsImpl.mkdir(directory, { recursive: true });
  const filePath = join(directory, `${runId}.json`);
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fsImpl.writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    await fsImpl.rename(temporaryPath, filePath);
  } catch (error) {
    await fsImpl.unlink(temporaryPath).catch(() => {});
    throw error;
  }
  return filePath;
}

export async function persistBriefing({ dataDir, runId, briefing, fsImpl = defaultFs }) {
  if (!briefing?.json || typeof briefing.markdown !== 'string') {
    throw new TypeError('briefing must contain json and markdown');
  }
  const directory = join(dataDir, 'briefings');
  await fsImpl.mkdir(directory, { recursive: true });
  const paths = {
    json: join(directory, `${runId}.json`),
    markdown: join(directory, `${runId}.md`),
  };
  for (const [key, contents] of [['json', `${JSON.stringify(briefing.json, null, 2)}\n`], ['markdown', `${briefing.markdown}\n`]]) {
    const temporaryPath = `${paths[key]}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fsImpl.writeFile(temporaryPath, contents, 'utf8');
      await fsImpl.rename(temporaryPath, paths[key]);
    } catch (error) {
      await fsImpl.unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }
  return paths;
}

export async function runPipeline({
  metaClient,
  presentonClient,
  config,
  window,
  collectedAt = new Date().toISOString(),
  runId = runIdFor(collectedAt),
  buildBriefing,
  persistBriefing: persistBriefingImpl,
  persistSnapshotImpl = persistSnapshot,
  onEvent = () => {},
}) {
  const snapshot = await collectSnapshot({ metaClient, config, window, collectedAt, onEvent });
  const snapshotPath = await persistSnapshotImpl({ dataDir: config.dataDir, runId, snapshot });
  onEvent('snapshot-persistence');
  let briefing;
  const briefingBuilder = buildBriefing ?? defaultBuildBriefing;
  briefing = await briefingBuilder({ ...snapshot, runId });
  const briefingPaths = await (persistBriefingImpl ?? persistBriefing)({ runId, briefing, dataDir: config.dataDir });
  onEvent('briefing-persistence');
  if (presentonClient?.generate) {
    try {
      const generatedPresentation = await presentonClient.generate({
        runId,
        content: briefing.markdown,
        slidesMarkdown: slideMarkdown(briefing.markdown),
        instructions: briefing.json.presentonInstructions,
        language: 'pt-BR',
        template: config.presentonTemplate,
         nSlides: window?.kind === 'monthly' ? 11 : 8,
        exportAs: config.presentonExportAs || 'pptx',
        outputDir: config.outputDir,
        outputFileName: `${runId}-${window.kind}.pptx`,
        snapshot,
        briefing,
        window: window?.kind,
      });
      const presentation = generatedPresentation?.outputPath
        ? generatedPresentation
        : { ...generatedPresentation, outputPath: join(config.outputDir, `${runId}-${window.kind}.pptx`) };
      return { runId, snapshot, snapshotPath, briefing, briefingPaths, presentation };
    } catch (error) {
      throw new Error(safeText(error?.message ?? error, config.metaAccessToken));
    }
  }
  return { runId, snapshot, snapshotPath, briefing, briefingPaths, presentation: null };
}
