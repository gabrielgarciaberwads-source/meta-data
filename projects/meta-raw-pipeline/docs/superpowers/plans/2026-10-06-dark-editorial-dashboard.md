# Dark Editorial Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Carbon Signal dashboard redesign with solid dark surfaces, equivalent-period comparisons, metric trend overlays, explicit quality states and responsive motion-safe behavior.

**Architecture:** Keep the same React 19/Vite dashboard and same-origin API. Add a small pure period utility for current/previous ranges, fetch the existing summary/timeseries endpoints for both ranges, and pass comparison data through the existing Overview, ChannelView, TimeSeries and MetricChart components. Replace the light CSS token system with a solid graphite design system rather than adding a chart or animation dependency.

**Tech Stack:** React 19, Vite, existing SVG charts, CSS transitions/keyframes, Node native test runner.

## Global Constraints

- Dashboard remains read-only and same-origin; the browser never receives Meta credentials or connects directly to PostgreSQL.
- Scope remains Instagram `ownerinc.gramado` (`17841449595671459`) and Ads `act_277127183253232`.
- Organic and Paid remain separate; no blended total or incompatible-metric ranking.
- Missing data remains `PARTIAL`, `UNAVAILABLE`, `NOT_VALIDATED` or `NOT_CONNECTED`; it is never converted to zero.
- Commercial cards remain `NOT_CONNECTED` until a CRM/ERP source exists.
- The background is solid graphite with no animated grid, noise layer, orb or large ambient gradient.
- Use existing SVG/CSS first; do not add a chart or motion dependency.
- Preserve keyboard focus, accessible SVG labels, evidence tables and reduced-motion behavior.
- Do not alter or activate Meta workflows, n8n, PostgreSQL or Nginx deployment behavior.

---

## File map

### Create

- `src/dashboard/periods.mjs` — pure period-mode and equivalent-previous-period calculations.
- `tests/dashboard-periods.test.mjs` — boundary and inclusive-range tests for Week, Month and Custom.

### Modify

- `src/dashboard/main.jsx` — period controls, current/previous API requests, executive comparison strip, comparison-aware channel panels and metric library.
- `src/dashboard/components/MetricCard.jsx` — render current value, valid comparison delta and explicit unavailable states.
- `src/dashboard/components/MetricChart.jsx` — render current and previous series on one shared scale with accessible labels.
- `src/dashboard/components/TimeSeries.jsx` — accept comparison series, preserve aggregation-safe values and show current/previous best and lowest days.
- `src/dashboard/styles.css` — solid dark Carbon Signal tokens, layout, chart treatment, responsive rules, focus styles and reduced-motion fallback.
- `tests/dashboard-ui.test.mjs` — assert the dark design contract, comparison UI and explicit commercial state.
- `docs/dashboard-contract.md` — document equivalent-period comparison, visual state rules and the approved dark design constraints.

### Do not modify

- `src/dashboard-api.mjs` and `src/dashboard-queries.mjs` unless validation proves an API field is missing. The existing APIs already accept arbitrary inclusive periods, so the first implementation should fetch current and previous periods separately instead of changing SQL.
- deploy files, workflows, credentials, n8n exports, PostgreSQL schema or proxy configuration.

---

## Task 1: Add tested period and comparison-range utilities

**Files:**
- Create: `src/dashboard/periods.mjs`
- Create: `tests/dashboard-periods.test.mjs`
- Modify: `src/dashboard/main.jsx:1-95`

**Interfaces:**
- `getPeriodRange(mode, anchorDate = new Date())` returns `{ start, end, mode }` with inclusive ISO dates. `WEEK` means the seven days ending at the anchor date; `MONTH` means the 30 days ending at the anchor date; `CUSTOM` is handled by `getPreviousRange` using the supplied custom range.
- `getPreviousRange({ start, end })` returns the immediately preceding inclusive range with the same number of days.
- `periodLabel(mode)` returns `Week`, `Month` or `Custom` for UI copy.
- `comparisonLabel(current, previous)` returns a deterministic display string for the two ranges.

- [ ] **Step 1: Write failing period tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPeriodRange, getPreviousRange, periodLabel } from '../src/dashboard/periods.mjs';

test('week is an inclusive seven-day range ending on the anchor date', () => {
  assert.deepEqual(getPeriodRange('WEEK', new Date('2026-10-06T12:00:00Z')), {
    mode: 'WEEK', start: '2026-09-30', end: '2026-10-06',
  });
});

test('month is an inclusive thirty-day range and previous range is adjacent', () => {
  const current = getPeriodRange('MONTH', new Date('2026-10-06T12:00:00Z'));
  assert.deepEqual(current, { mode: 'MONTH', start: '2026-09-07', end: '2026-10-06' });
  assert.deepEqual(getPreviousRange(current), { mode: 'CUSTOM', start: '2026-08-08', end: '2026-09-06' });
});

test('custom previous range preserves duration and labels', () => {
  const current = { mode: 'CUSTOM', start: '2026-10-01', end: '2026-10-05' };
  assert.deepEqual(getPreviousRange(current), { mode: 'CUSTOM', start: '2026-09-26', end: '2026-09-30' });
  assert.equal(periodLabel('CUSTOM'), 'Custom');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/dashboard-periods.test.mjs`

Expected: FAIL because `src/dashboard/periods.mjs` does not exist yet.

- [ ] **Step 3: Implement the pure utilities**

Use UTC date arithmetic only. Keep formatting in one helper so daylight-saving changes cannot alter the number of included dates:

```js
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

export function getPeriodRange(mode, anchorDate = new Date()) {
  const end = new Date(anchorDate);
  const days = mode === 'MONTH' ? 30 : 7;
  const start = new Date(end.getTime() - (days - 1) * DAY_MS);
  return { mode, start: iso(start), end: iso(end) };
}

export function getPreviousRange({ start, end }) {
  const duration = Math.round((dateOnly(end) - dateOnly(start)) / DAY_MS) + 1;
  return { mode: 'CUSTOM', start: iso(shift(start, -duration)), end: iso(shift(start, -1)) };
}

export function periodLabel(mode) {
  return mode === 'WEEK' ? 'Week' : mode === 'MONTH' ? 'Month' : 'Custom';
}

export function comparisonLabel(current, previous) {
  return `${current.start} → ${current.end} vs ${previous.start} → ${previous.end}`;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --test tests/dashboard-periods.test.mjs`

Expected: PASS with three tests.

- [ ] **Step 5: Wire period state into the existing app without changing API contracts**

Replace the fixed 30-day `initialFilters()` result with `{ ...getPeriodRange('WEEK'), mode: 'WEEK' }`. Add a `previous` range derived from `getPreviousRange(filters)`. Keep date inputs for Custom and set `mode: 'CUSTOM'` when either date changes. Fetch previous data by passing the same account IDs with `period_start` and `period_end` from the previous range.

- [ ] **Step 6: Run the existing API and UI tests**

Run: `npm test`

Expected: the existing tests remain green; no SQL or API contract changes are required.

- [ ] **Step 7: Commit the period utility**

```bash
git add src/dashboard/periods.mjs tests/dashboard-periods.test.mjs src/dashboard/main.jsx
git commit -m "feat: add equivalent dashboard period ranges"
```

## Task 2: Make metric cards and charts comparison-aware

**Files:**
- Modify: `src/dashboard/components/MetricCard.jsx`
- Modify: `src/dashboard/components/MetricChart.jsx`
- Modify: `src/dashboard/components/TimeSeries.jsx`
- Modify: `tests/dashboard-ui.test.mjs`

**Interfaces:**
- `MetricCard({ label, value, previousValue, status, note, description, aggregationType, deltaLabel })` renders a delta only when both numeric values are available and the current status is not unavailable.
- `MetricChart({ points, comparisonPoints, label, comparisonLabel })` normalizes the y-scale across numeric values from both series and renders current/previous lines without inventing missing points.
- `TimeSeries({ series, comparisonSeries, definitions })` keeps the existing selector and evidence table while exposing current and previous chart points and summaries.

- [ ] **Step 1: Extend static UI tests for the comparison contract**

Add assertions for `previousValue`, `comparisonPoints`, `Current period`, `Previous period`, `prefers-reduced-motion` and `NOT_CONNECTED`. Keep the existing assertions that raw payloads and credentials are absent.

- [ ] **Step 2: Run the focused UI test and verify the new assertions fail**

Run: `node --test tests/dashboard-ui.test.mjs`

Expected: FAIL on at least the new comparison and reduced-motion assertions.

- [ ] **Step 3: Implement safe comparison formatting in `MetricCard.jsx`**

Use a helper that returns `null` unless both values are finite and the current status is `AVAILABLE` or `PARTIAL` with a finite value. Do not render `0%` for missing data. For a previous value of zero, render an em dash rather than an infinite percentage.

- [ ] **Step 4: Implement shared-scale dual-series SVG in `MetricChart.jsx`**

Keep valid points only, preserve `null` gaps, compute min/max over both current and comparison values, and render:

- solid cyan current line;
- dashed muted previous line;
- optional current point markers;
- accessible `role="img"` and `aria-label` naming both periods;
- date labels from the current period and a summary for best/lowest valid days.

Do not add Recharts or GSAP; the existing SVG path approach is sufficient.

- [ ] **Step 5: Pass comparison data through `TimeSeries.jsx`**

Match the selected metric by name, apply the existing `ADDITIVE` aggregation rule independently to each period, and render the evidence table for the selected/current observations. Keep the “show all metrics” behavior and explicit status badges.

- [ ] **Step 6: Run UI tests and build**

Run: `node --test tests/dashboard-ui.test.mjs` and `npm run build`

Expected: PASS; Vite produces `dist/` without adding dependencies.

- [ ] **Step 7: Commit comparison-aware components**

```bash
git add src/dashboard/components/MetricCard.jsx src/dashboard/components/MetricChart.jsx src/dashboard/components/TimeSeries.jsx tests/dashboard-ui.test.mjs
git commit -m "feat: compare dashboard metrics across equivalent periods"
```

## Task 3: Implement the Carbon Signal Overview composition

**Files:**
- Modify: `src/dashboard/main.jsx`
- Modify: `src/dashboard/components/MetricCard.jsx`

**Interfaces:**
- `Overview` consumes current summary, previous summary and definitions; it never combines channel values.
- `ExecutiveChannelPanel({ channel, title, current, previous, definitions })` renders best available signal, attention state, status and comparison KPIs.
- `MetricLibrary({ channel, current, previous, definitions })` maps requested metrics to available values and renders `UNAVAILABLE` or `NOT_CONNECTED` when the source does not exist.

- [ ] **Step 1: Add Overview test contract entries**

Extend the UI test to require `Performance, with provenance`, `Current period`, `Previous period`, `Collection confidence`, `Metric library`, `NOT_CONNECTED`, and the requested metric labels. Keep the tests string-based because this repository does not use a browser component-test dependency.

- [ ] **Step 2: Run the focused test and verify the new Overview labels fail**

Run: `node --test tests/dashboard-ui.test.mjs`

Expected: FAIL on the new Overview labels.

- [ ] **Step 3: Add a compact period-control component**

Render Week, Month and Custom buttons. The active mode updates the current range and derives the previous range. Custom keeps the date inputs as the source of truth. Give buttons accessible labels and a visible keyboard focus ring.

- [ ] **Step 4: Fetch current and previous summary/definitions for Overview**

Use the existing `useApi` hook with two summary requests. Keep loading/error handling explicit: a failed current or previous request shows the existing error state; missing metric values remain em dashes with status text.

- [ ] **Step 5: Build the executive split and comparison strip**

Use `primaryMetric` only within each channel. Compute deltas only for the same metric name in current and previous data. Render the collection confidence and warnings without claiming completeness.

- [ ] **Step 6: Add the metric library and commercial states**

Use the requested metric catalog as display metadata. Resolve values by safe source aliases (`reach`, `impressions`, `views`, `shares`, `saves`, `engagement_rate`, `average_watch_time`, `net_follower_growth`, `profile_visits`, `link_clicks`). If no validated item exists, show `—` plus `UNAVAILABLE`; render commercial metrics as `NOT_CONNECTED` with their formula/definition.

- [ ] **Step 7: Update ChannelView to fetch and render previous timeseries**

Fetch current and previous series for the same channel and pass both to `TimeSeries`. The detail page must retain its evidence table and definitions, while its chart compares only the selected metric.

- [ ] **Step 8: Run UI tests and build**

Run: `node --test tests/dashboard-ui.test.mjs` and `npm run build`

Expected: PASS; no raw payload, credential or blended-channel text is introduced.

- [ ] **Step 9: Commit the Overview composition**

```bash
git add src/dashboard/main.jsx src/dashboard/components/MetricCard.jsx tests/dashboard-ui.test.mjs
git commit -m "feat: add executive comparison overview"
```

## Task 4: Replace the light visual system with the approved solid dark system

**Files:**
- Modify: `src/dashboard/styles.css`
- Modify: `src/dashboard/components/StatusBadge.jsx` only if the dark contrast requires a semantic class adjustment.

- [ ] **Step 1: Replace the light tokens with Carbon Signal tokens**

Set the app background to solid graphite and define raised surfaces, cool borders, primary/secondary text, Organic cyan, Paid coral, warning amber, healthy green and focus color. Remove the old paper/beige tokens and do not add any CSS `gradient`, `noise`, grid or orb background.

- [ ] **Step 2: Style the layout hierarchy**

Keep the existing top bar/filter rail/page-content architecture, but use the new dark surfaces, editorial heading scale, monospace metadata and thin borders. Make the read-only scope and selected period prominent without turning them into decorative cards.

- [ ] **Step 3: Style comparison surfaces and metric library**

Add styles for comparison strips, signal cards, KPI deltas, metric library cards, commercial `NOT_CONNECTED` cards, dual-series chart lines, tooltip/crosshair, quality rail and evidence tables. Organic and Paid accent rules must remain visually distinct.

- [ ] **Step 4: Add purposeful motion and reduced-motion fallback**

Use only short opacity/transform transitions, active-period glide, chart reveal and 1–3px hover lift. Under `@media (prefers-reduced-motion: reduce)`, remove travel, spring and chart animation while preserving color/opacity feedback.

- [ ] **Step 5: Preserve responsive and focus behavior**

At widths below 930px use a two-row top bar with horizontally scrollable navigation and a 175px filter rail; below 650px switch the app shell to a block layout, place the filter rail above the page, and stack channel panels, chart context and metric library cards. Keep form controls usable, tables horizontally scrollable and all focus-visible outlines readable.

- [ ] **Step 6: Run static UI tests and build**

Run: `node --test tests/dashboard-ui.test.mjs` and `npm run build`

Expected: PASS; the test must assert dark tokens, absence of gradients and presence of reduced-motion CSS.

- [ ] **Step 7: Commit the dark visual system**

```bash
git add src/dashboard/styles.css src/dashboard/components/StatusBadge.jsx tests/dashboard-ui.test.mjs
git commit -m "feat: apply carbon signal dashboard theme"
```

## Task 5: Update contract, validate behavior and prepare the PR

**Files:**
- Modify: `docs/dashboard-contract.md`
- Modify: `README.md` only if the dashboard behavior summary needs an updated period-comparison sentence.
- Test: `tests/dashboard-periods.test.mjs`, `tests/dashboard-ui.test.mjs`, existing dashboard API/query/deploy tests.

- [ ] **Step 1: Document the new comparison and visual rules**

Add the following contract facts to `docs/dashboard-contract.md`: the Overview supports Week/Month/Custom; comparison is the immediately preceding inclusive range of equal duration; charts compare one metric and channel at a time; unavailable and commercial states remain explicit; the visual background is solid graphite and motion has a reduced-motion fallback.

- [ ] **Step 2: Run the complete project verification**

Run: `npm run verify`

Expected: all native tests pass and Vite build succeeds.

- [ ] **Step 3: Run a local dashboard smoke test**

Run: `npm start` in a separate process, request `/api/health`, and open the dashboard in the browser. Verify Overview, Organic, Paid and Quality navigation; Week/Month/Custom controls; current/previous chart legend; explicit `PARTIAL`/`UNAVAILABLE`/`NOT_CONNECTED`; and no exposed credentials.

- [ ] **Step 4: Inspect rendered layouts**

Use the browser at desktop (1440px), tablet and mobile (390px). Confirm solid background, readable contrast, no horizontal overflow in the main layout, stacked panels on mobile and a usable evidence table.

- [ ] **Step 5: Check the diff and repository scope**

Run:

```bash
git diff --check
git diff --stat HEAD -- src/dashboard tests docs/dashboard-contract.md README.md
git status --short
```

Confirm the PR contains only dashboard source, tests, contract/docs and the period utility. Do not stage unrelated workspace changes.

- [ ] **Step 6: Create the PR branch and final commit if needed**

Use a branch named `feat/meta-raw-dashboard-dark-editorial` from the dashboard implementation branch. Push only the dashboard commits and open a PR against the agreed staging branch. Do not deploy until CI and review pass.

- [ ] **Step 7: Assemble the PR description**

The PR must include:

- summary of the Carbon Signal visual system;
- current/previous period behavior;
- Organic/Paid separation;
- explicit availability/commercial states;
- tests and build commands with results;
- desktop/mobile screenshots or browser captures;
- statement that no Meta workflow, n8n, PostgreSQL or proxy service was changed.
