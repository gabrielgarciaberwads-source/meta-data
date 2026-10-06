# Dark Editorial Dashboard Design

## Status

Design approved for the visual direction. Implementation has not started.

## Objective

Evolve the read-only Meta Raw dashboard into a dark, innovative analytics
interface that feels closer to a premium editorial data product than a generic
admin panel. The first screen must answer what changed, show Organic and Paid
side by side without combining them, and keep the provenance and quality state
of every number visible.

The visual direction approved by the user is **Carbon Signal**:

- a solid, near-black graphite background;
- dark raised surfaces instead of a textured or animated background;
- Organic and Paid differentiated by restrained accent colors;
- editorial typography and generous hierarchy;
- charts and quality states treated as the main visual language;
- no decorative effect that competes with the data.

## Scope

### In scope

- Overview redesign using a solid dark background;
- Week / Month / Custom period controls;
- current period versus equivalent previous period;
- Organic and Paid panels kept independent;
- charts for the requested metric families;
- compact KPI cards with sparklines;
- selected-metric trend chart with comparison line, tooltip and evidence context;
- explicit `PARTIAL`, `UNAVAILABLE`, `NOT_VALIDATED` and `NOT_CONNECTED` states;
- definitions and formulas adjacent to the relevant metric;
- responsive behavior for desktop, tablet and mobile;
- purposeful motion with reduced-motion fallback.

### Out of scope

- CRM/ERP integration;
- blending Organic and Paid totals;
- inventing values when a source is missing;
- changing Meta collection workflows or credentials;
- exposing PostgreSQL, tokens or raw payloads to the browser;
- adding a chart or animation dependency before the existing SVG/CSS approach
  has been evaluated;
- publishing or activating any workflow.

## Product and data constraints

The dashboard remains read-only and same-origin. The browser consumes the
dashboard API only; it never receives Meta credentials and never connects
directly to PostgreSQL.

The monitored scope remains:

- Instagram account `ownerinc.gramado` (`17841449595671459`);
- Ads account `act_277127183253232`.

Organic and Paid must remain visually and semantically separate. A comparison
is valid only when it uses the same metric, channel and equivalent period.
Missing data remains missing and is never converted to zero.

Commercial metrics are reserved for the future CRM/ERP source:

- qualified contacts;
- customers;
- revenue;
- contact-to-customer conversion.

Until that source exists, these surfaces must show `NOT_CONNECTED` and explain
the required cohort or formula.

## Visual system

### Surfaces and color roles

Use a solid background and a small, semantic palette. Exact values may be
tuned during implementation, but the roles must remain stable:

| Role | Direction |
| --- | --- |
| App background | near-black graphite, approximately `#070A0D` |
| Raised surface | blue-charcoal, approximately `#0E151A` |
| Elevated surface | slightly lighter blue-charcoal, approximately `#121C22` |
| Structural line | cool dark border, approximately `#22313A` |
| Primary text | pale cool white, approximately `#ECF6F5` |
| Secondary text | desaturated blue-gray, approximately `#81939A` |
| Organic accent | cyan/teal, approximately `#68E4DF` |
| Paid accent | coral/red, approximately `#FF776D` |
| Warning | warm amber, approximately `#F4C271` |
| Healthy / validated | restrained green, approximately `#79E1B0` |

The background must remain flat. No grid texture, animated orb, noise layer or
large ambient gradient is required for the approved version. If a subtle visual
effect is later proposed, it must be opt-in and demonstrably not reduce chart
contrast.

### Typography and layout

- Keep the existing brand typography where available.
- Use large, light editorial headings for page and section titles.
- Use a restrained monospace treatment for dates, statuses, metric names and
  evidence identifiers.
- Preserve the existing high-level navigation: Overview, Organic, Paid and
  Quality.
- Use a 12-column or equivalent fluid layout on wide screens, collapsing to a
  single reading column on mobile.
- Prefer one meaningful visual per surface over nested cards.
- Keep borders thin and shadows low-contrast; hierarchy should come primarily
  from spacing, type scale, accent rules and surface changes.

## Overview composition

The first page is organized in the following order:

1. **Top bar**
   - Ownerinc / Meta Raw identity;
   - Overview, Organic, Paid and Quality navigation;
   - explicit read-only indicator.
2. **Editorial hero**
   - short executive title;
   - one-sentence explanation of the reading;
   - period and scope context;
   - visible demo/provenance or data-quality context where relevant.
3. **Period controls**
   - Week, Month and Custom;
   - current period and previous equivalent period;
   - account scope remains explicit.
4. **Comparison strip**
   - strongest validated signal;
   - current value and period change;
   - collection confidence;
   - no blended channel total.
5. **Organic / Paid executive split**
   - best available signal;
   - point requiring attention;
   - status badge;
   - compact supporting KPIs and sparklines.
6. **Selected-metric trend**
   - metric selector;
   - current and previous lines;
   - best and lowest day for the same metric;
   - tooltip/crosshair context;
   - aggregation and coverage context.
7. **Metric library**
   - compact cards for exposure, interest, engagement, video, audience,
     traffic and commercial readiness;
   - definition or formula close to the value;
   - unavailable and not-connected states visible.
8. **Quality and traceability**
   - coverage, collection run and state;
   - link or navigation path to the existing Quality page for full evidence.

## Metric-to-chart mapping

| Metric | Primary visual | Required reading rule |
| --- | --- | --- |
| Reach | current/previous line or area line | distinct accounts; same channel and period |
| Views | current/previous line | repeated displays or plays are allowed |
| Shares and saves | grouped bars or two lollipop series | preserve each metric separately |
| Engagement rate | rate KPI plus small trend | only same-publication denominator and formula |
| Average Reel watch time | daily line | do not imply retention without source support |
| Net follower growth | signed daily line or bars | follows minus unfollows |
| Profile visits | compact line or bars | profile interest, not commercial conversion |
| Link clicks | compact line or bars | keep separate from profile visits |
| Qualified contacts | reserved commercial card | `NOT_CONNECTED` until CRM/ERP exists |
| Customers | reserved commercial card | same contact cohort only |
| Revenue | reserved commercial card | no Meta-only inference |
| Contact-to-customer conversion | formula card | customers / qualified contacts × 100 |

The primary trend chart must not plot incompatible metrics on the same scale.
The visual may provide a selector, but it must replace the metric context rather
than silently overlaying unrelated units.

## Motion system

Motion should explain state, continuity or feedback. It must not create a
perpetual animated background.

### Approved motion patterns

- Initial page surfaces: opacity plus an 8–12px vertical lift;
- Week/Month/Custom selection: short gliding active indicator;
- Metric change: small content crossfade, preserving the chart surface;
- First chart render or metric change: restrained SVG line reveal;
- Chart hover: crosshair and point emphasis, with tooltip anchored to the data;
- KPI refresh: color/value transition, not an exaggerated counter animation;
- Status changes: border and color transition only; no continuous warning pulse;
- Hover cards: maximum 1–3px lift and a subtle border/surface change.

### Motion constraints

- Keep frequent interactions below roughly 300ms where possible;
- avoid page-wide transitions for filters and tabs;
- do not animate every child in a metric grid;
- disable travel, scale and spring overshoot under
  `prefers-reduced-motion: reduce` while preserving useful color and opacity
  feedback;
- keep chart animation deterministic and never use motion to conceal missing
  data.

## Reference integration

The research references are treated as patterns, not as a request to copy a
whole product or visual identity:

- **shadcn charts/dashboard:** area, line, bar, tooltip and filter composition;
  source repository license was verified as MIT. Adapt the patterns to the
  existing React/Vite/SVG implementation instead of adding the entire kit.
- **Beszel:** dark operational hierarchy, health states, historical trend
  context and quality close to the metric; repository license was verified as
  MIT. Use the information architecture as reference, not its branding.
- **GSAP:** production-quality timing and SVG motion reference. Do not add GSAP
  until CSS/SVG transitions prove insufficient.
- **beUI Motion Patterns:** purpose-first motion, timing ranges and reduced
  motion fallback.
- **Kinetics:** spring and gliding interaction references. Code reuse requires a
  separate license check; visual patterns may be recreated independently.
- **React Bits:** ambient/component inspiration only. No asset or code reuse is
  assumed without verifying the specific component license.

## Existing implementation fit

The current dashboard already provides the right technical foundation:

- React 19 and Vite;
- local CSS tokens and responsive media queries;
- `MetricChart.jsx` with SVG rendering;
- `TimeSeries.jsx` with metric selection, aggregation-safe points, best/lowest
  day and evidence table;
- same-origin API and explicit status states.

The visual implementation should evolve `styles.css` and the existing chart
components first. New components are appropriate only when they isolate a
single responsibility, such as a comparison chart, a quality rail or a metric
library card.

## Accessibility and responsive behavior

- Maintain visible keyboard focus states against the dark surfaces.
- Keep status text available to assistive technology; color alone is not a
  status indicator.
- Give SVG charts an accessible name and provide the tabular/evidence view as a
  non-visual alternative.
- Keep all controls reachable and usable at touch sizes on mobile.
- Ensure cyan, coral, amber and muted states meet readable contrast against
  their respective surfaces.
- On mobile, stack Organic and Paid, then the chart, then the metric library;
  never horizontally compress a chart until labels become unreadable.
- Test at desktop, tablet and mobile widths with reduced motion enabled.

## Acceptance criteria for implementation

- [ ] Background is solid graphite with no animated ambient layer.
- [ ] Organic and Paid are visibly separated in the Overview and detail pages.
- [ ] Week/Month/Custom period controls preserve equivalent-period comparison.
- [ ] The selected-metric chart shows current and previous periods without
      mixing units or channels.
- [ ] Tooltips, best/lowest day and evidence context remain available.
- [ ] All requested metric families have a visual home or an explicit
      unavailable/not-connected state.
- [ ] No missing value is rendered as zero.
- [ ] Quality state and coverage are visible near the summary and chart.
- [ ] Motion is subtle, purposeful and has a reduced-motion fallback.
- [ ] The dashboard remains read-only and retains the existing API/security
      boundaries.
- [ ] Existing tests pass and visual checks cover desktop and mobile.
