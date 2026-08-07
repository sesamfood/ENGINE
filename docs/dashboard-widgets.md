# Dashboard widgets

Widgets use the shared `MetricResult` contract from `lib/dashboard/types.ts`. A metric owns data computation; a visualization only renders that normalized result. Location comparisons use one series per location, while aggregate scope uses one `all` series.

## Adding a metric

1. Add the metric id to `metricIds` and its Danish definition to `metricRegistry` in `lib/dashboard/registry.ts`.
2. Implement the id in the exhaustive `dashboardMetricComputers` record in `convex/lib/dashboardMetrics.ts`. Use organization-scoped indexes, validate locations before computation, bucket points in the organization time zone, and include the preceding equal-length period in `previousTotal` when the source data supports it.
3. Choose compatible visualizations and a default size in the registry. The add-widget dialog then exposes the metric without UI changes.

## Visualizations

- `kpi`: total and optional location totals.
- `line`: time-series development.
- `bar`: time series or ranked breakdown.
- `area`: time-series volume.
- `donut`: categorical breakdown.
- `gauge`: progress against `target`.
- `list`: compact ranked breakdown or series totals.
- `table`: detailed breakdown or location comparison.

Only visualizations listed on the metric definition can be selected. Visualizations must not query data or contain metric-specific rules.

The add-widget dialog is a three-step flow: search and choose a metric, choose a compatible visualization from live previews, then choose a fixed tile size.

One-row tiles use a compact rendering: charts remove nonessential axes and legends, while tables and lists use dense rows so content stays inside the tile.

## Sizes

- `1x1`: one column and one row.
- `1x2`: one column and two rows.
- `2x1`: two columns and one row.
- `2x2`: two columns and two rows.
- `4x2`: full desktop width and two rows.

The grid collapses to two columns on tablets and one on phones. Desktop edit mode exposes the fixed grid and the full drop footprint. Drag anywhere on a card to move it into an empty cell, or drop it directly on one card to exchange both position and size. Dropping a larger card across several occupied cells preserves its size and reflows the covered cards below it. Drag the lower-right corner handle to snap between the supported sizes. Keyboard users can focus the handle and use the arrow keys.

The visualization control opens a dialog containing live previews rendered from the widget's current `MetricResult`. Keep the preview components data-only; changing visualization must not trigger a second metric query.

## Public shares

Shares snapshot widgets, scope, and range when created. Metric data remains reactive. Links expire, can be revoked, and may require a password. Passwords use salted PBKDF2; the browser keeps the returned unlock key in `sessionStorage`.

Metrics marked `shareable: false` are removed from the snapshot. Public queries must verify token, unlock key, expiry, revocation, snapshotted metric membership, and organization-owned locations.

## Missing data domains

The current database has waste, bad deliveries, stock counts and reconciliation, transfers, staff food, scheduled shifts, and persisted sales history (`salesOrders`, `salesLines`, `salesDaily`). The sales metrics `salesRevenue`, `salesOrderCount`, and `averageBasket` are admin-only and shareable. Guest scores, reviews, events, and labor cost still do not exist. Do not simulate these domains.

Per-widget scope overrides, multiple named dashboards per user, and organization-wide default layouts are intentionally outside the first version.
