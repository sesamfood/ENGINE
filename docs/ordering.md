# Ordering

`/ordering` plans one location at a time. Products with recipe ingredients are hidden by default. The list includes the location's selected products and their ingredients. Quantities use each product's default unit. Manual quantities stay separate for each location while the page is open. Export contains positive quantities from the enabled product set, regardless of the search or "only in order" filter.

`ordering.plan` grants access to planning, stock quantities, and ingredient consumption history. `ordering.export` additionally allows CSV export. Both default to Administrator and Manager. Configured role permissions remain authoritative. Every query checks organization membership and location access. Kiosk mode is excluded.

## Forecast

`lib/ordering-forecast.ts` calculates a weighted mean for each weekday from up to 56 complete local calendar days. The weight halves every 28 days. With fewer than two samples for a weekday, it uses the weighted daily mean. This is a simple seasonal baseline, following the use of seasonal benchmarks described in [Forecasting: Principles and Practice](https://otexts.com/fpp3/simple-methods.html). It has not been calibrated against this organization's future orders.

The current data source is `salesStockApplications`, the stored ingredient consumption produced by OnlinePOS stock synchronization. No provider API runs when opening the page. Historical recipes, unit conversions, modifiers, and refunds are already represented in these records. Removed sales applications are excluded. Pages have bounded reads and load to completion before suggestions or export become available.

The first recorded day is discarded because it may be partial. Subsequent dates without consumption count as zero. A product without positive consumption in its current default unit receives no forecast. Short history and missing stock are flagged. Suggestions pause while stock synchronization is disabled, unfinished, stale, or reports errors. Manual planning remains available. Unmapped sales are also shown. Prepared products may have no consumption of their own because their sales were expanded into ingredients.

The suggested quantity is expected demand for the coverage period, plus the selected buffer, minus positive stock. Negative book stock is treated as zero. Unknown stock is flagged and treated as zero. Suggestions round up to three decimal places in the default unit; pack-size rounding is not inferred from unit names. Manual quantities accept up to six decimal places.

The coverage period starts today and includes lead time. There is no delivery-date model, incoming-order deduction, shelf-life calculation, or automatic purchase submission. Waste, Staff food, holidays, and weather are not currently included. Planning changes are held in the open page; download the CSV to keep a completed plan.

## Adding data or export formats

`DemandObservation` is independent of the sales provider. Another data adapter can supply dated consumption in a product's default unit. Keep source selection explicit to avoid counting the same sale twice through two providers.

`DemandFactor` accepts a source name, local date, product ID, and nonnegative multiplier. Holiday, weather, or event models can supply these factors to `forecastOrder` without changing the ordering UI. Factors multiply the daily baseline before the safety buffer and stock deduction. Obtain external data in Convex actions and store it before reading it for a forecast.

`ordering.prepareExport` validates the location, current products, units, quantities, and export permission, then returns format-independent rows. CSV uses the existing escaped, formula-safe, UTF-8 download helper. Future exporters can consume the same rows.
