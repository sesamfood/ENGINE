# Ordering

`/ordering` plans one location at a time. Products with recipe ingredients are hidden by default. The list includes the location's selected products and their ingredients. Quantities use each product's default unit. Manual quantities stay separate for each location while the page is open. Export contains positive quantities from the enabled product set, regardless of the search or "only in order" filter.

`ordering.plan` grants access to planning, stock quantities, and ingredient consumption history. `ordering.export` additionally allows CSV export. Both default to Administrator and Manager. Configured role permissions remain authoritative. Every query checks organization membership and location access. Kiosk mode is excluded.

## Forecast

`lib/ordering-forecast.ts` calculates a weighted mean for each weekday from up to 56 complete local calendar days. The weight halves every 28 days. With fewer than two samples for a weekday, it uses the weighted daily mean. This is a simple seasonal baseline, following the use of seasonal benchmarks described in [Forecasting: Principles and Practice](https://otexts.com/fpp3/simple-methods.html). It has not been calibrated against this organization's future orders.

The current data source is `salesStockApplications`, the stored ingredient consumption produced by OnlinePOS stock synchronization. No provider API runs when opening the page. Historical recipes, unit conversions, modifiers, and refunds are already represented in these records. Removed sales applications are excluded. Pages have bounded reads and load to completion before suggestions or export become available.

The first recorded day is discarded because it may be partial. Subsequent dates without consumption count as zero. A product without positive consumption in its current default unit receives no forecast. Short history and missing stock are flagged. Suggestions pause while stock synchronization is disabled, unfinished, stale, or reports errors. Manual planning remains available. Unmapped sales are also shown. Prepared products may have no consumption of their own because their sales were expanded into ingredients.

The suggested quantity is expected demand for the coverage period, plus the selected buffer, minus positive stock. Negative book stock is treated as zero. Unknown stock is flagged and treated as zero. Suggestions round up to three decimal places in the default unit; pack-size rounding is not inferred from unit names. Manual quantities accept up to six decimal places.

The coverage period starts today and includes lead time. There is no delivery-date model, incoming-order deduction, shelf-life calculation, or automatic purchase submission. Waste and Staff food are not included. Planning changes are held in the open page; download the CSV to keep a completed plan.

## Weather, holidays, and predicted sales

Set `OPEN_METEO_API_KEY` in the Convex deployment's environment settings. Keep it server-side. In Administration, open a location's information and enable weather and holidays. Enter its latitude, longitude, two-letter country code, and optionally its ISO subdivision code. Use the location's correct time zone. No sales data is sent to either provider.

Weather uses the commercial [Open-Meteo forecast API](https://open-meteo.com/en/docs) and [historical weather API](https://open-meteo.com/en/docs/historical-weather-api). The subscription must include archive access. Daily mean temperature and precipitation are matched to sales by local calendar date. The archive covers up to 400 previous days; the forecast endpoint supplies the latest seven days and up to 16 forecast days. Historical weather is model/reanalysis data. Weather attribution: [Open-Meteo](https://open-meteo.com/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Public holidays use the [Nager.Holidays API](https://nagerholidays.com/api). National holidays are included; regional holidays require a matching subdivision code. School holidays, optional observances, and local events are not included. An unavailable calendar is treated as unknown, not as a year without holidays.

`convex/forecasts.ts` refreshes configured locations every six hours and after configuration changes. “Opdatér forslag” also requests a refresh, with ten-minute reuse. Actions fetch providers; queries only read Convex. Each organization/location has a bounded `locationForecasts` document containing at most 428 daily conditions and 28 predicted days. Completed archive dates are reused. Each run refreshes recent weather so an old forecast cannot become historical training data. Leases prevent concurrent refreshes and revision checks reject results for changed settings. Provider errors are sanitized before storage.

`lib/sales-forecast.ts` fits weighted ridge regression to log daily revenue from stored `salesDaily`. Weekday, trend, and annual terms control calendar variation; temperature, precipitation, and public-holiday terms estimate their additional associations with sales. Weather needs at least 56 matched historical days. Holidays need at least three holiday days, 28 ordinary days, and 56 complete training days. Missing inputs do not become observed weather or holiday values. Forecasting with future explanatory variables follows [Forecasting: Principles and Practice](https://otexts.com/fpp3/forecasting-regression.html).

The model applies those learned effects to the recent weekday baseline, relative to the normal conditions in that baseline. Multipliers are bounded between 0.25 and 4. These are practical safeguards, not confidence intervals. Future days outside weather coverage retain their weekday baseline, with a holiday adjustment if supported. With insufficient history, the model uses the weekday baseline alone. This model has not been backtested against the organization's sales; weather and holiday associations do not establish causation.

Ordering applies the location's learned revenue multiplier to each product's ingredient-consumption forecast before the buffer and stock deduction. This assumes the product mix and prices remain stable. It does not learn separate weather effects for each product yet. The factor contract remains available for future product-specific models and other data sources.

The dashboard metric **Forventet omsætning, næste 7 dage** is available in the normal add-widget dialog. It always covers tomorrow through the following six days, regardless of the dashboard's historical date selection. It uses the existing visualizations, currency handling, location selection, sales permissions, and sharing restrictions. It requires at least 14 complete days of synchronized sales. Incomplete location coverage produces a setup/data message instead of a misleading partial total. Stale forecasts expire after 26 hours; missing learned effects show “Begrænset data”. This metric uses the provider-agnostic `salesDaily` history currently populated by OnlinePOS, without adding Wolt revenue a second time.

## Adding data or export formats

`DemandObservation` is independent of the sales provider. Another data adapter can supply dated consumption in a product's default unit. Keep source selection explicit to avoid counting the same sale twice through two providers.

`DemandFactor` accepts a source name, local date, product ID, and nonnegative multiplier. Holiday, weather, or event models can supply these factors to `forecastOrder` without changing the ordering UI. Factors multiply the daily baseline before the safety buffer and stock deduction. Obtain external data in Convex actions and store it before reading it for a forecast.

`ordering.prepareExport` validates the location, current products, units, quantities, and export permission, then returns format-independent rows. CSV uses the existing escaped, formula-safe, UTF-8 download helper. Future exporters can consume the same rows.
