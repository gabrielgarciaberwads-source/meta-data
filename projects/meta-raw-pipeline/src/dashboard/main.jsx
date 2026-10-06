import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DataTable } from './components/DataTable.jsx';
import { MetricCard, formatValue } from './components/MetricCard.jsx';
import { StatusBadge } from './components/StatusBadge.jsx';
import { TimeSeries } from './components/TimeSeries.jsx';
import { getPeriodRange, getPreviousRange, periodLabel } from './periods.mjs';
import logoUrl from './assets/ownerinc-completa-black.png';
import './styles.css';

const ORGANIC_ACCOUNT_ID = '17841449595671459';
const AD_ACCOUNT_ID = 'act_277127183253232';
const tabs = ['Overview', 'Organic', 'Paid', 'Quality'];

const countMeta = {
  media: { label: 'Content items', description: 'Posts, carousels and Reels observed in the selected period.' },
  stories: { label: 'Stories', description: 'Stories observed in the selected period.' },
  collaborators: { label: 'Collaborators', description: 'Collaborator records linked to the monitored Instagram account.' },
  campaigns: { label: 'Campaigns', description: 'Campaign records available for the selected ad account.' },
  adsets: { label: 'Ad sets', description: 'Ad set records available for the selected ad account.' },
  ads: { label: 'Ads', description: 'Ad records available for the selected ad account.' },
  creatives: { label: 'Creatives', description: 'Creative records available for the selected ad account.' },
};

const priorityMetrics = {
  ORGANIC: ['reach', 'impressions', 'views', 'likes', 'comments', 'saves', 'shares', 'replies', 'navigation'],
  PAID: ['spend', 'amount_spent', 'impressions', 'reach', 'clicks', 'inline_link_clicks', 'link_clicks', 'conversions'],
};

const fallbackMetricLabels = {
  reach: 'Reach',
  impressions: 'Views / impressions',
  views: 'Views',
  likes: 'Likes',
  comments: 'Comments',
  saves: 'Saves',
  shares: 'Shares',
  replies: 'Replies',
  navigation: 'Navigation',
  spend: 'Spend',
  amount_spent: 'Amount spent',
  clicks: 'Clicks',
  inline_link_clicks: 'Link clicks',
  link_clicks: 'Link clicks',
  conversions: 'Conversions',
};

const metricCatalog = [
  { name: 'reach', label: 'Reach', aliases: ['reach'], channel: 'ORGANIC', description: 'Distinct accounts that saw the content.' },
  { name: 'views', label: 'Views', aliases: ['views', 'impressions'], channel: 'ORGANIC', description: 'Displays or plays, including repeats.' },
  { name: 'shares', label: 'Shares', aliases: ['shares'], channel: 'ORGANIC', description: 'Times people shared the content.' },
  { name: 'saves', label: 'Saves', aliases: ['saves'], channel: 'ORGANIC', description: 'Times people saved the content for later.' },
  { name: 'engagement_rate', label: 'Engagement rate', aliases: ['engagement_rate', 'engagement'], channel: 'ORGANIC', description: 'Interactions divided by reach using the same publication.' },
  { name: 'average_watch_time', label: 'Avg. Reel watch time', aliases: ['average_watch_time', 'avg_watch_time'], channel: 'ORGANIC', description: 'Average time viewers sustain attention on Reels.' },
  { name: 'net_follower_growth', label: 'Net follower growth', aliases: ['net_follower_growth', 'follower_growth'], channel: 'ORGANIC', description: 'New followers minus unfollows.' },
  { name: 'profile_visits', label: 'Profile visits', aliases: ['profile_visits', 'profile_views'], channel: 'ORGANIC', description: 'Interest in learning more about the company.' },
  { name: 'link_clicks', label: 'Link clicks', aliases: ['link_clicks', 'inline_link_clicks', 'clicks'], channel: 'PAID', description: 'The next step toward site, store or contact.' },
];

const commercialCatalog = [
  { label: 'Qualified contacts', description: 'Prepared for a future CRM/ERP source.' },
  { label: 'Customers', description: 'Customers from the same qualified-contact cohort.' },
  { label: 'Revenue', description: 'Attributed commercial value pending a connected source.' },
  { label: 'Lead → customer', description: 'Customers ÷ qualified contacts × 100, same cohort only.' },
];

function useApi(path, params, enabled = true) {
  const [state, setState] = useState({ loading: enabled, data: null, error: null });
  const serializedParams = JSON.stringify(params);
  const query = useMemo(() => new URLSearchParams(JSON.parse(serializedParams)).toString(), [serializedParams]);
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    setState({ loading: true, data: null, error: null });
    fetch(`${path}?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const text = await response.text();
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          throw new Error('Dashboard API is unavailable.');
        }
        if (!response.ok) throw new Error(body.error?.message ?? 'Dashboard request failed.');
        return body;
      })
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ loading: false, data: null, error: error.message });
      });
    return () => controller.abort();
  }, [path, query, enabled]);
  return state;
}

function requestParams(period) {
  return {
    period_start: period.start,
    period_end: period.end,
    organic_account_id: ORGANIC_ACCOUNT_ID,
    ad_account_id: AD_ACCOUNT_ID,
  };
}

function initialFilters() {
  return getPeriodRange('WEEK');
}

function labelForMetric(name) {
  return fallbackMetricLabels[name] ?? String(name ?? '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function definitionFor(definitions, name) {
  return definitions.find((definition) => definition.metricName === name) ?? null;
}

function metricView(item, definitions) {
  const definition = definitionFor(definitions, item.name);
  return {
    ...item,
    label: labelForMetric(item.name),
    definition,
    description: definition?.definition ?? 'Definition not registered for this metric.',
    aggregationType: definition?.aggregationType,
  };
}

function findMetric(block, names = []) {
  return names.map((name) => (block?.metrics ?? []).find((item) => item.name === name)).find(Boolean) ?? null;
}

function channelStatus(blocks = []) {
  if (blocks.some((block) => block?.status === 'PARTIAL')) return 'PARTIAL';
  if (blocks.some((block) => block?.status === 'NOT_VALIDATED')) return 'NOT_VALIDATED';
  if (blocks.some((block) => block?.status === 'UNAVAILABLE')) return 'UNAVAILABLE';
  return 'AVAILABLE';
}

function primaryMetric(block, channel) {
  const metrics = block?.metrics ?? [];
  const available = metrics.filter((item) => item.status === 'AVAILABLE' && item.value !== null);
  return priorityMetrics[channel].map((name) => available.find((item) => item.name === name)).find(Boolean) ?? available[0] ?? null;
}

function kpisFor(block, channel, definitions) {
  const metrics = (block?.metrics ?? []).map((item) => metricView(item, definitions));
  const preferred = priorityMetrics[channel].map((name) => metrics.find((item) => item.name === name)).filter(Boolean);
  const counts = Object.entries(block?.counts ?? {}).map(([name, value]) => ({
    name,
    label: countMeta[name]?.label ?? name,
    value: block?.status === 'NOT_VALIDATED' ? null : value,
    status: block?.status === 'NOT_VALIDATED' ? 'NOT_VALIDATED' : 'AVAILABLE',
    description: countMeta[name]?.description,
  }));
  return [...preferred, ...counts, ...metrics.filter((item) => !preferred.includes(item))].slice(0, 4);
}

function deltaFor(current, previous) {
  const currentValue = Number(current?.value);
  const previousValue = Number(previous?.value);
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue) || previousValue === 0) return null;
  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}

function deltaLabel(current, previous) {
  const delta = deltaFor(current, previous);
  if (delta === null) return null;
  return `${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)}% vs previous`;
}

function PageHeader({ eyebrow, title, description, status }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div><div className="page-header-meta"><StatusBadge status={status} /><p>{description}</p></div></header>;
}

function LoadingState() {
  return <div className="loading-state" aria-live="polite">Reading validated aggregates…</div>;
}

function ErrorState({ message }) {
  return <div className="error-state" role="alert"><strong>Data path unavailable.</strong><span>{message}</span></div>;
}

function ComparisonStrip({ period, previous, organic, previousOrganic, paid }) {
  const organicHighlight = primaryMetric(organic, 'ORGANIC');
  return <section className="comparison-strip" aria-label="Period comparison">
    <div><span>Current period</span><strong>{period.start} → {period.end}</strong><small>Selected range</small></div>
    <div><span>Previous period</span><strong>{previous.start} → {previous.end}</strong><small>Equivalent duration</small></div>
    <div><span>Organic signal</span><strong>{organicHighlight ? `${labelForMetric(organicHighlight.name)} · ${formatValue(organicHighlight.value)}` : '—'}</strong><small>{deltaLabel(organicHighlight, findMetric(previousOrganic, [organicHighlight?.name])) ?? 'No valid comparison'}</small></div>
    <div><span>Collection confidence</span><strong>{channelStatus([organic, paid])}</strong><small>{organic?.warnings?.length || paid?.warnings?.length ? 'Warnings require context' : 'No warnings returned'}</small></div>
  </section>;
}

function ChannelPanel({ channel, title, block, previousBlock, definitions = [], compact = false, showHeading = true, showFoot = true }) {
  const kpis = compact ? kpisFor(block, channel, definitions) : [
    ...Object.entries(block?.counts ?? {}).map(([name, value]) => ({
      name,
      label: countMeta[name]?.label ?? name,
      value: block?.status === 'NOT_VALIDATED' ? null : value,
      status: block?.status === 'NOT_VALIDATED' ? 'NOT_VALIDATED' : 'AVAILABLE',
      description: countMeta[name]?.description,
    })),
    ...(block?.metrics ?? []).map((item) => metricView(item, definitions)),
  ];
  return <section className={`channel-panel channel-${channel.toLowerCase()}`}>
    {showHeading ? <div className="section-heading"><div><p className="eyebrow">{channel}</p><h2>{title}</h2></div><StatusBadge status={block?.status ?? 'NOT_VALIDATED'} /></div> : null}
    <div className="metric-grid">{kpis.map((item) => <MetricCard key={item.name} label={item.label} value={item.value} previousValue={findMetric(previousBlock, [item.name])?.value} status={item.status} note={item.observedAt ? `Observed ${new Date(item.observedAt).toLocaleDateString()}` : undefined} description={item.description} aggregationType={item.aggregationType} deltaLabel={deltaLabel(item, findMetric(previousBlock, [item.name]))} />)}</div>
    {showFoot ? <div className="channel-foot"><span>Coverage</span><strong>{block?.coverage?.periodStart ?? '—'} → {block?.coverage?.periodEnd ?? '—'}</strong></div> : null}
  </section>;
}

function ExecutiveChannelPanel({ channel, title, block, previousBlock, definitions }) {
  const highlight = primaryMetric(block, channel);
  const highlighted = highlight ? metricView(highlight, definitions) : null;
  const isPartial = block?.status === 'PARTIAL';
  const hasUnavailable = (block?.metrics ?? []).some((item) => item.status !== 'AVAILABLE');
  const attention = isPartial
    ? 'Coverage is partial. Available values are shown, but this period should not be treated as complete.'
    : hasUnavailable
      ? 'Some indicators are unavailable for this source or period. Missing data is not zero.'
      : 'No coverage warning was returned for this channel in the selected period.';
  const previousHighlight = highlight ? findMetric(previousBlock, [highlight.name]) : null;

  return <section className={`executive-channel channel-${channel.toLowerCase()}`}>
    <div className="executive-channel-head"><div><p className="eyebrow">{channel}</p><h2>{title}</h2></div><StatusBadge status={block?.status ?? 'NOT_VALIDATED'} /></div>
    <div className="executive-insights"><div className="signal-card signal-primary"><span className="signal-label">Best available signal</span><strong>{highlighted?.label ?? 'No validated metric'}</strong><b>{highlighted ? formatValue(highlighted.value) : '—'}</b><span className="signal-delta">{deltaLabel(highlight, previousHighlight) ?? 'No valid comparison'}</span><p>{highlighted?.description ?? 'There is no validated performance metric for this period.'}</p></div><div className="signal-card signal-attention"><span className="signal-label">Where to look carefully</span><strong>{isPartial ? 'Partial coverage' : hasUnavailable ? 'Unavailable indicators' : 'No coverage alert'}</strong><p>{attention}</p></div></div>
    <div className="executive-kpis"><ChannelPanel channel={channel} title="" block={block} previousBlock={previousBlock} definitions={definitions} compact showHeading={false} showFoot={false} /></div>
    <p className="comparison-note"><b>How to read:</b> the delta compares the same KPI and equivalent period. It is not a ranking between incompatible metrics.</p>
  </section>;
}

function MetricLibrary({ channel, block, previousBlock, definitions }) {
  const items = metricCatalog.filter((item) => item.channel === channel);
  return <section className={`metric-library channel-${channel.toLowerCase()}`}><div className="section-heading"><div><p className="eyebrow">Metric library / {channel}</p><h2>{channel === 'ORGANIC' ? 'Exposure, interest and audience' : 'Delivery and action'}</h2></div><StatusBadge status={block?.status ?? 'NOT_VALIDATED'} /></div><div className="metric-grid metric-library-grid">{items.map((item) => { const current = findMetric(block, item.aliases); const previous = findMetric(previousBlock, item.aliases); const definition = current ? definitionFor(definitions, current.name) : definitionFor(definitions, item.name); return <MetricCard key={item.name} label={item.label} value={current?.value ?? null} previousValue={previous?.value ?? null} status={current?.status ?? 'UNAVAILABLE'} description={definition?.definition ?? item.description} deltaLabel={deltaLabel(current, previous)} />; })}</div></section>;
}

function CommercialLibrary() {
  return <section className="metric-library commercial-library"><div className="section-heading"><div><p className="eyebrow">Commercial / future source</p><h2>From attention to outcome</h2></div><StatusBadge status="NOT_CONNECTED" /></div><div className="metric-grid metric-library-grid">{commercialCatalog.map((item) => <MetricCard key={item.label} label={item.label} value={null} status="NOT_CONNECTED" description={item.description} />)}</div></section>;
}

function Overview({ filters }) {
  const previous = useMemo(() => getPreviousRange(filters), [filters]);
  const state = useApi('/api/dashboard/summary', requestParams(filters));
  const previousState = useApi('/api/dashboard/summary', requestParams(previous));
  const definitions = useApi('/api/dashboard/definitions', {});
  const status = state.data && previousState.data ? channelStatus([state.data.organic, state.data.paid]) : 'NOT_VALIDATED';
  return <main id="main-content" className="page-content"><PageHeader eyebrow="Meta / executive view" title="Performance, with provenance." description={`${filters.start} — ${filters.end} vs ${previous.start} — ${previous.end}. Organic and Paid remain separate.`} status={status} />{state.loading || previousState.loading || definitions.loading ? <LoadingState /> : state.error || previousState.error ? <ErrorState message={state.error ?? previousState.error} /> : state.data && previousState.data ? <><ComparisonStrip period={filters} previous={previous} organic={state.data.organic} previousOrganic={previousState.data.organic} paid={state.data.paid} /><div className="executive-grid"><ExecutiveChannelPanel channel="ORGANIC" title="Organic performance" block={state.data.organic} previousBlock={previousState.data.organic} definitions={definitions.data?.definitions ?? []} /><ExecutiveChannelPanel channel="PAID" title="Paid performance" block={state.data.paid} previousBlock={previousState.data.paid} definitions={definitions.data?.definitions ?? []} /></div><MetricLibrary channel="ORGANIC" block={state.data.organic} previousBlock={previousState.data.organic} definitions={definitions.data?.definitions ?? []} /><MetricLibrary channel="PAID" block={state.data.paid} previousBlock={previousState.data.paid} definitions={definitions.data?.definitions ?? []} /><CommercialLibrary /></> : null}</main>;
}

function ChannelView({ filters, channel }) {
  const previous = useMemo(() => getPreviousRange(filters), [filters]);
  const params = requestParams(filters);
  const previousParams = requestParams(previous);
  const summary = useApi('/api/dashboard/summary', params);
  const previousSummary = useApi('/api/dashboard/summary', previousParams);
  const series = useApi('/api/dashboard/timeseries', { ...params, channel });
  const previousSeries = useApi('/api/dashboard/timeseries', { ...previousParams, channel });
  const definitions = useApi('/api/dashboard/definitions', { channel });
  const block = summary.data?.[channel.toLowerCase()];
  const previousBlock = previousSummary.data?.[channel.toLowerCase()];
  const title = channel === 'ORGANIC' ? 'Organic observations' : 'Paid observations';
  return <main id="main-content" className="page-content"><PageHeader eyebrow={`${channel} / detail`} title={title} description={`${filters.start} — ${filters.end} vs ${previous.start} — ${previous.end}. Same-metric comparisons only.`} status={block?.status ?? 'NOT_VALIDATED'} />{summary.loading || previousSummary.loading || series.loading || previousSeries.loading || definitions.loading ? <LoadingState /> : summary.error || previousSummary.error || series.error || previousSeries.error ? <ErrorState message={summary.error ?? previousSummary.error ?? series.error ?? previousSeries.error} /> : block ? <><ChannelPanel channel={channel} title={channel === 'ORGANIC' ? 'Content and story inventory' : 'Campaign and delivery inventory'} block={block} previousBlock={previousBlock} definitions={definitions.data?.definitions ?? []} /><section className="data-section"><div className="section-heading"><div><p className="eyebrow">Observed over time</p><h2>Trend and metric guide</h2></div><StatusBadge status={block.status} /></div><TimeSeries series={series.data?.series} comparisonSeries={previousSeries.data?.series} definitions={definitions.data?.definitions ?? []} /></section></> : null}</main>;
}

function Quality({ filters }) {
  const quality = useApi('/api/dashboard/quality', requestParams(filters));
  const definitions = useApi('/api/dashboard/definitions', {});
  const columns = [{ key: 'workflowName', label: 'Workflow' }, { key: 'status', label: 'State' }, { key: 'periodStart', label: 'Start' }, { key: 'periodEnd', label: 'End' }, { key: 'collectionRunId', label: 'Collection run' }];
  return <main id="main-content" className="page-content"><PageHeader eyebrow="Quality / traceability" title="The evidence behind the numbers." description="Runs, periods, states and definitions without payload exposure." status={quality.data ? 'AVAILABLE' : 'NOT_VALIDATED'} />{quality.loading || definitions.loading ? <LoadingState /> : quality.error || definitions.error ? <ErrorState message={quality.error ?? definitions.error} /> : <><section className="quality-intro"><strong>Quality is part of the result.</strong><span>Use the state and collection run to decide how much confidence to place in a number. A partial run is not a complete result.</span></section><section className="data-section"><div className="section-heading"><div><p className="eyebrow">Collection runs</p><h2>Latest run ledger</h2></div><StatusBadge status="AVAILABLE" /></div><DataTable columns={columns} rows={quality.data?.runs} empty="No validated runs for this period." /></section><section className="data-section"><div className="section-heading"><div><p className="eyebrow">Metric dictionary</p><h2>Definitions</h2></div></div><DataTable columns={[{ key: 'metricName', label: 'Metric' }, { key: 'channel', label: 'Channel' }, { key: 'aggregationType', label: 'Aggregation' }, { key: 'definition', label: 'Definition' }]} rows={definitions.data?.definitions} empty="No metric definitions available." /></section></>}</main>;
}

function PeriodControls({ filters, onModeChange, onDateChange }) {
  return <div className="period-controls"><p className="eyebrow">Compare periods</p><div className="period-mode" role="group" aria-label="Comparison period"><button type="button" className={filters.mode === 'WEEK' ? 'active' : ''} onClick={() => onModeChange('WEEK')}>Week</button><button type="button" className={filters.mode === 'MONTH' ? 'active' : ''} onClick={() => onModeChange('MONTH')}>Month</button><button type="button" className={filters.mode === 'CUSTOM' ? 'active' : ''} onClick={() => onModeChange('CUSTOM')}>Custom</button></div><label>From<input type="date" value={filters.start} onChange={(event) => onDateChange('start', event.target.value)} /></label><label>To<input type="date" value={filters.end} onChange={(event) => onDateChange('end', event.target.value)} /></label></div>;
}

function App() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [filters, setFilters] = useState(initialFilters);
  const view = activeTab === 'Overview' ? <Overview filters={filters} /> : activeTab === 'Organic' ? <ChannelView filters={filters} channel="ORGANIC" /> : activeTab === 'Paid' ? <ChannelView filters={filters} channel="PAID" /> : <Quality filters={filters} />;
  function changeMode(mode) {
    if (mode === 'CUSTOM') {
      setFilters((current) => ({ ...current, mode }));
      return;
    }
    setFilters(getPeriodRange(mode, new Date(`${filters.end}T12:00:00Z`)));
  }
  function changeDate(key, value) {
    setFilters((current) => ({ ...current, mode: 'CUSTOM', [key]: value }));
  }
  return <div className="app-shell"><header className="topbar"><a className="brand" href="#main-content" aria-label="Ownerinc Meta Raw home"><img src={logoUrl} alt="Ownerinc" /><span>/ Meta Raw</span></a><nav aria-label="Dashboard sections">{tabs.map((tab) => <button key={tab} className="nav-button" data-active={activeTab === tab} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav><p className="signature">signal, with provenance</p><span className="read-only"><i></i> Read only</span></header><aside className="filter-rail" aria-label="Dashboard filters"><PeriodControls filters={filters} onModeChange={changeMode} onDateChange={changeDate} /><div className="scope-note"><span>Organic account</span><strong>{ORGANIC_ACCOUNT_ID}</strong><span>Paid account</span><strong>{AD_ACCOUNT_ID}</strong></div><p className="rail-note">Read-only internal view. Missing data remains a state, never a fabricated zero.</p><p className="rail-note"><strong>{periodLabel(filters.mode)}</strong> compares the selected period with the immediately preceding range of equal duration.</p></aside>{view}</div>;
}

createRoot(document.getElementById('root')).render(<App />);
