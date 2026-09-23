# UI scanability screenshots

All 26 findings from the [source review](https://l2hkhnjfexwi.postplan.dev) are covered by the before/after pairs below. Use pair numbers **1–43** to choose which changes to keep.

These are browser captures of the actual React components. A temporary Vite harness supplies deterministic session, query and action fixtures; it does not connect to customer data or provider accounts. Both versions use the same fixture data, interactions, viewport, timezone and app fonts. Live authentication and provider flows remain unverified.

Before: `54a1d5b0cdfc727887345014b682281519f9cc2b`. After: the implementation in this branch. Captures use Chromium through Playwright, with the clock set to 23 September 2026 at 14:00 Europe/Copenhagen. Most pairs use a 1280px viewport; the schedule uses 744px and the scrolled permissions view uses 1024px. Long administration pages use viewport captures at the relevant section; other pages use full-page captures.

Validation: production build and TypeScript, ESLint, all 86 existing tests, and browser interaction checks for user/stock/provider filters, permission change/revert cues, reason gating, and keyboard history actions. Additional phone/tablet checks covered 390px, 744px and 768px layouts. No production preview routes or new test dependencies were added.


| Finding | Screenshot coverage |
| --- | --- |
| 1 | [1. Ordering warnings and quantity columns](#operations-ordering) |
| 2 | [2. Overdue checks and due dates](#own-checks-overdue) |
| 3 | [3. Changed permissions and save controls](#permissions) · [4. Permission context while scrolling](#permissions-scroll) |
| 4 | [5. User search, roles and location access](#members) |
| 5 | [6. Count product names](#operations-count) · [7. Waste product names and action emphasis](#operations-waste) · [8. Stock product names, search and categories](#operations-stock) |
| 6 | [9. Metric picker and selected calculation help](#metric-picker) |
| 7 | [10. Sent and received quantity labels](#operations-receipt) |
| 8 | [11. Named location actions](#locations) |
| 9 | [12. Active and archived catalogue views](#catalog-status) |
| 10 | [13. Shared dashboard location and period context](#shared-dashboard) · [37. Named widget actions and period override](#dashboard-widget-settings) |
| 11 | [14. Readable labels in small comparison widgets](#compact-charts) · [15. Disclosed chart group limits](#chart-groups-limit) |
| 12 | [7. Waste product names and action emphasis](#operations-waste) · [16. Staff food action emphasis](#operations-staff-food) · [17. Label preparation actions](#operations-labels) |
| 13 | [1. Ordering warnings and quantity columns](#operations-ordering) · [19. Waste quantity alignment and details](#operations-waste-report) · [20. Bad-delivery quantity alignment and details](#operations-bad-detail) |
| 14 | [19. Waste quantity alignment and details](#operations-waste-report) · [20. Bad-delivery quantity alignment and details](#operations-bad-detail) · [21. Transfer details and temperature exceptions](#operations-transfer-history) |
| 15 | [8. Stock product names, search and categories](#operations-stock) |
| 16 | [17. Label preparation actions](#operations-labels) · [18. Label preparation and print preview](#operations-label-preview) |
| 17 | [22. Activation and connection status](#integrations) |
| 18 | [23. OnlinePOS connection attention list](#onlinepos-connections) · [24. OnlinePOS product mapping filter](#onlinepos-mappings) · [25. Visible missing menu mappings](#onlinepos-menus) · [26. Workfeed mapping attention list](#workfeed-mappings) · [27. e-conomic agreement attention list](#economic-connections) · [28. Wolt connection attention list](#wolt-connections) · [29. Wolt mapping state and editing](#wolt-mappings) |
| 19 | [30. Product unit rows](#recipe-units) · [31. Shared ingredient columns and quieter guidance](#recipe-ingredients) |
| 20 | [32. Transfer product groups](#operations-transfer) · [33. Invoice products within menu boundaries](#operations-invoice) · [34. Bad-delivery product groups](#operations-bad-registration) |
| 21 | [35. Pending transfers grouped by date](#operations-pending) |
| 22 | [36. Visible single-location action](#dashboard-location-picker) · [37. Named widget actions and period override](#dashboard-widget-settings) |
| 23 | [38. Today selected and scheduled employees first](#employee-schedule) |
| 24 | [39. Open deviations and follow-up actions first](#own-check-follow-up) |
| 25 | [40. Order columns, quiet mapping state and product IDs](#wolt-order) |
| 26 | [41. Password confirmation errors](#password-mismatch) · [42. Expired password link recovery](#password-expired) · [43. Form-level password network errors](#password-network) |

<a id="operations-ordering"></a>
<details>
<summary>1. Ordering warnings and quantity columns</summary>

Audit findings: 1, 13.

| Before 1 | After 1 |
| --- | --- |
| ![Before 1: Ordering warnings and quantity columns](images/operations/operations-ordering-before.png) | ![After 1: Ordering warnings and quantity columns](images/operations/operations-ordering-after.png) |

</details>

<a id="own-checks-overdue"></a>
<details>
<summary>2. Overdue checks and due dates</summary>

Audit findings: 2.

| Before 2 | After 2 |
| --- | --- |
| ![Before 2: Overdue checks and due dates](images/dashboard/own-checks-overdue-before.png) | ![After 2: Overdue checks and due dates](images/dashboard/own-checks-overdue-after.png) |

</details>

<a id="permissions"></a>
<details>
<summary>3. Changed permissions and save controls</summary>

Audit findings: 3.

| Before 3 | After 3 |
| --- | --- |
| ![Before 3: Changed permissions and save controls](images/root/permissions-before.png) | ![After 3: Changed permissions and save controls](images/root/permissions-after.png) |

</details>

<a id="permissions-scroll"></a>
<details>
<summary>4. Permission context while scrolling</summary>

Audit findings: 3.

| Before 4 | After 4 |
| --- | --- |
| ![Before 4: Permission context while scrolling](images/root/permissions-scroll-before.png) | ![After 4: Permission context while scrolling](images/root/permissions-scroll-after.png) |

</details>

<a id="members"></a>
<details>
<summary>5. User search, roles and location access</summary>

Audit findings: 4.

| Before 5 | After 5 |
| --- | --- |
| ![Before 5: User search, roles and location access](images/root/members-before.png) | ![After 5: User search, roles and location access](images/root/members-after.png) |

</details>

<a id="operations-count"></a>
<details>
<summary>6. Count product names</summary>

Audit findings: 5.

| Before 6 | After 6 |
| --- | --- |
| ![Before 6: Count product names](images/operations/operations-count-before.png) | ![After 6: Count product names](images/operations/operations-count-after.png) |

</details>

<a id="operations-waste"></a>
<details>
<summary>7. Waste product names and action emphasis</summary>

Audit findings: 5, 12.

| Before 7 | After 7 |
| --- | --- |
| ![Before 7: Waste product names and action emphasis](images/operations/operations-waste-before.png) | ![After 7: Waste product names and action emphasis](images/operations/operations-waste-after.png) |

</details>

<a id="operations-stock"></a>
<details>
<summary>8. Stock product names, search and categories</summary>

Audit findings: 5, 15.

| Before 8 | After 8 |
| --- | --- |
| ![Before 8: Stock product names, search and categories](images/operations/operations-stock-before.png) | ![After 8: Stock product names, search and categories](images/operations/operations-stock-after.png) |

</details>

<a id="metric-picker"></a>
<details>
<summary>9. Metric picker and selected calculation help</summary>

Audit findings: 6.

| Before 9 | After 9 |
| --- | --- |
| ![Before 9: Metric picker and selected calculation help](images/dashboard/metric-picker-before.png) | ![After 9: Metric picker and selected calculation help](images/dashboard/metric-picker-after.png) |

</details>

<a id="operations-receipt"></a>
<details>
<summary>10. Sent and received quantity labels</summary>

Audit findings: 7.

| Before 10 | After 10 |
| --- | --- |
| ![Before 10: Sent and received quantity labels](images/operations/operations-receipt-before.png) | ![After 10: Sent and received quantity labels](images/operations/operations-receipt-after.png) |

</details>

<a id="locations"></a>
<details>
<summary>11. Named location actions</summary>

Audit findings: 8.

| Before 11 | After 11 |
| --- | --- |
| ![Before 11: Named location actions](images/administration-focused/locations-before.png) | ![After 11: Named location actions](images/administration-focused/locations-after.png) |

</details>

<a id="catalog-status"></a>
<details>
<summary>12. Active and archived catalogue views</summary>

Audit findings: 9.

| Before 12 | After 12 |
| --- | --- |
| ![Before 12: Active and archived catalogue views](images/administration-focused/catalog-status-before.png) | ![After 12: Active and archived catalogue views](images/administration-focused/catalog-status-after.png) |

</details>

<a id="shared-dashboard"></a>
<details>
<summary>13. Shared dashboard location and period context</summary>

Audit findings: 10.

| Before 13 | After 13 |
| --- | --- |
| ![Before 13: Shared dashboard location and period context](images/dashboard/shared-dashboard-before.png) | ![After 13: Shared dashboard location and period context](images/dashboard/shared-dashboard-after.png) |

</details>

<a id="compact-charts"></a>
<details>
<summary>14. Readable labels in small comparison widgets</summary>

Audit findings: 11.

| Before 14 | After 14 |
| --- | --- |
| ![Before 14: Readable labels in small comparison widgets](images/dashboard/compact-charts-before.png) | ![After 14: Readable labels in small comparison widgets](images/dashboard/compact-charts-after.png) |

</details>

<a id="chart-groups-limit"></a>
<details>
<summary>15. Disclosed chart group limits</summary>

Audit findings: 11.

| Before 15 | After 15 |
| --- | --- |
| ![Before 15: Disclosed chart group limits](images/dashboard/chart-groups-limit-before.png) | ![After 15: Disclosed chart group limits](images/dashboard/chart-groups-limit-after.png) |

</details>

<a id="operations-staff-food"></a>
<details>
<summary>16. Staff food action emphasis</summary>

Audit findings: 12.

| Before 16 | After 16 |
| --- | --- |
| ![Before 16: Staff food action emphasis](images/operations/operations-staff-food-before.png) | ![After 16: Staff food action emphasis](images/operations/operations-staff-food-after.png) |

</details>

<a id="operations-labels"></a>
<details>
<summary>17. Label preparation actions</summary>

Audit findings: 12, 16.

| Before 17 | After 17 |
| --- | --- |
| ![Before 17: Label preparation actions](images/operations/operations-labels-before.png) | ![After 17: Label preparation actions](images/operations/operations-labels-after.png) |

</details>

<a id="operations-label-preview"></a>
<details>
<summary>18. Label preparation and print preview</summary>

Audit findings: 16.

| Before 18 | After 18 |
| --- | --- |
| ![Before 18: Label preparation and print preview](images/operations/operations-label-preview-before.png) | ![After 18: Label preparation and print preview](images/operations/operations-label-preview-after.png) |

</details>

<a id="operations-waste-report"></a>
<details>
<summary>19. Waste quantity alignment and details</summary>

Audit findings: 13, 14.

| Before 19 | After 19 |
| --- | --- |
| ![Before 19: Waste quantity alignment and details](images/operations/operations-waste-report-before.png) | ![After 19: Waste quantity alignment and details](images/operations/operations-waste-report-after.png) |

</details>

<a id="operations-bad-detail"></a>
<details>
<summary>20. Bad-delivery quantity alignment and details</summary>

Audit findings: 13, 14.

| Before 20 | After 20 |
| --- | --- |
| ![Before 20: Bad-delivery quantity alignment and details](images/operations/operations-bad-detail-before.png) | ![After 20: Bad-delivery quantity alignment and details](images/operations/operations-bad-detail-after.png) |

</details>

<a id="operations-transfer-history"></a>
<details>
<summary>21. Transfer details and temperature exceptions</summary>

Audit findings: 14.

| Before 21 | After 21 |
| --- | --- |
| ![Before 21: Transfer details and temperature exceptions](images/operations/operations-transfer-history-before.png) | ![After 21: Transfer details and temperature exceptions](images/operations/operations-transfer-history-after.png) |

</details>

<a id="integrations"></a>
<details>
<summary>22. Activation and connection status</summary>

Audit findings: 17.

| Before 22 | After 22 |
| --- | --- |
| ![Before 22: Activation and connection status](images/root/integrations-before.png) | ![After 22: Activation and connection status](images/root/integrations-after.png) |

</details>

<a id="onlinepos-connections"></a>
<details>
<summary>23. OnlinePOS connection attention list</summary>

Audit findings: 18.

| Before 23 | After 23 |
| --- | --- |
| ![Before 23: OnlinePOS connection attention list](images/administration-focused/onlinepos-connections-before.png) | ![After 23: OnlinePOS connection attention list](images/administration-focused/onlinepos-connections-after.png) |

</details>

<a id="onlinepos-mappings"></a>
<details>
<summary>24. OnlinePOS product mapping filter</summary>

Audit findings: 18.

| Before 24 | After 24 |
| --- | --- |
| ![Before 24: OnlinePOS product mapping filter](images/administration-focused/onlinepos-mappings-before.png) | ![After 24: OnlinePOS product mapping filter](images/administration-focused/onlinepos-mappings-after.png) |

</details>

<a id="onlinepos-menus"></a>
<details>
<summary>25. Visible missing menu mappings</summary>

Audit findings: 18.

| Before 25 | After 25 |
| --- | --- |
| ![Before 25: Visible missing menu mappings](images/administration-focused/onlinepos-menus-before.png) | ![After 25: Visible missing menu mappings](images/administration-focused/onlinepos-menus-after.png) |

</details>

<a id="workfeed-mappings"></a>
<details>
<summary>26. Workfeed mapping attention list</summary>

Audit findings: 18.

| Before 26 | After 26 |
| --- | --- |
| ![Before 26: Workfeed mapping attention list](images/administration-focused/workfeed-mappings-before.png) | ![After 26: Workfeed mapping attention list](images/administration-focused/workfeed-mappings-after.png) |

</details>

<a id="economic-connections"></a>
<details>
<summary>27. e-conomic agreement attention list</summary>

Audit findings: 18.

| Before 27 | After 27 |
| --- | --- |
| ![Before 27: e-conomic agreement attention list](images/administration-focused/economic-connections-before.png) | ![After 27: e-conomic agreement attention list](images/administration-focused/economic-connections-after.png) |

</details>

<a id="wolt-connections"></a>
<details>
<summary>28. Wolt connection attention list</summary>

Audit findings: 18.

| Before 28 | After 28 |
| --- | --- |
| ![Before 28: Wolt connection attention list](images/administration-focused/wolt-connections-before.png) | ![After 28: Wolt connection attention list](images/administration-focused/wolt-connections-after.png) |

</details>

<a id="wolt-mappings"></a>
<details>
<summary>29. Wolt mapping state and editing</summary>

Audit findings: 18.

| Before 29 | After 29 |
| --- | --- |
| ![Before 29: Wolt mapping state and editing](images/administration-focused/wolt-mappings-before.png) | ![After 29: Wolt mapping state and editing](images/administration-focused/wolt-mappings-after.png) |

</details>

<a id="recipe-units"></a>
<details>
<summary>30. Product unit rows</summary>

Audit findings: 19.

| Before 30 | After 30 |
| --- | --- |
| ![Before 30: Product unit rows](images/administration-focused/recipe-units-before.png) | ![After 30: Product unit rows](images/administration-focused/recipe-units-after.png) |

</details>

<a id="recipe-ingredients"></a>
<details>
<summary>31. Shared ingredient columns and quieter guidance</summary>

Audit findings: 19.

| Before 31 | After 31 |
| --- | --- |
| ![Before 31: Shared ingredient columns and quieter guidance](images/administration-focused/recipe-ingredients-before.png) | ![After 31: Shared ingredient columns and quieter guidance](images/administration-focused/recipe-ingredients-after.png) |

</details>

<a id="operations-transfer"></a>
<details>
<summary>32. Transfer product groups</summary>

Audit findings: 20.

| Before 32 | After 32 |
| --- | --- |
| ![Before 32: Transfer product groups](images/operations/operations-transfer-before.png) | ![After 32: Transfer product groups](images/operations/operations-transfer-after.png) |

</details>

<a id="operations-invoice"></a>
<details>
<summary>33. Invoice products within menu boundaries</summary>

Audit findings: 20.

| Before 33 | After 33 |
| --- | --- |
| ![Before 33: Invoice products within menu boundaries](images/operations/operations-invoice-before.png) | ![After 33: Invoice products within menu boundaries](images/operations/operations-invoice-after.png) |

</details>

<a id="operations-bad-registration"></a>
<details>
<summary>34. Bad-delivery product groups</summary>

Audit findings: 20.

| Before 34 | After 34 |
| --- | --- |
| ![Before 34: Bad-delivery product groups](images/operations/operations-bad-registration-before.png) | ![After 34: Bad-delivery product groups](images/operations/operations-bad-registration-after.png) |

</details>

<a id="operations-pending"></a>
<details>
<summary>35. Pending transfers grouped by date</summary>

Audit findings: 21.

| Before 35 | After 35 |
| --- | --- |
| ![Before 35: Pending transfers grouped by date](images/operations/operations-pending-before.png) | ![After 35: Pending transfers grouped by date](images/operations/operations-pending-after.png) |

</details>

<a id="dashboard-location-picker"></a>
<details>
<summary>36. Visible single-location action</summary>

Audit findings: 22.

| Before 36 | After 36 |
| --- | --- |
| ![Before 36: Visible single-location action](images/dashboard/dashboard-location-picker-before.png) | ![After 36: Visible single-location action](images/dashboard/dashboard-location-picker-after.png) |

</details>

<a id="dashboard-widget-settings"></a>
<details>
<summary>37. Named widget actions and period override</summary>

Audit findings: 10, 22.

| Before 37 | After 37 |
| --- | --- |
| ![Before 37: Named widget actions and period override](images/dashboard/dashboard-widget-settings-before.png) | ![After 37: Named widget actions and period override](images/dashboard/dashboard-widget-settings-after.png) |

</details>

<a id="employee-schedule"></a>
<details>
<summary>38. Today selected and scheduled employees first</summary>

Audit findings: 23.

| Before 38 | After 38 |
| --- | --- |
| ![Before 38: Today selected and scheduled employees first](images/dashboard/employee-schedule-before.png) | ![After 38: Today selected and scheduled employees first](images/dashboard/employee-schedule-after.png) |

</details>

<a id="own-check-follow-up"></a>
<details>
<summary>39. Open deviations and follow-up actions first</summary>

Audit findings: 24.

| Before 39 | After 39 |
| --- | --- |
| ![Before 39: Open deviations and follow-up actions first](images/dashboard/own-check-follow-up-before.png) | ![After 39: Open deviations and follow-up actions first](images/dashboard/own-check-follow-up-after.png) |

</details>

<a id="wolt-order"></a>
<details>
<summary>40. Order columns, quiet mapping state and product IDs</summary>

Audit findings: 25.

| Before 40 | After 40 |
| --- | --- |
| ![Before 40: Order columns, quiet mapping state and product IDs](images/administration-focused/wolt-order-before.png) | ![After 40: Order columns, quiet mapping state and product IDs](images/administration-focused/wolt-order-after.png) |

</details>

<a id="password-mismatch"></a>
<details>
<summary>41. Password confirmation errors</summary>

Audit findings: 26.

| Before 41 | After 41 |
| --- | --- |
| ![Before 41: Password confirmation errors](images/dashboard/password-mismatch-before.png) | ![After 41: Password confirmation errors](images/dashboard/password-mismatch-after.png) |

</details>

<a id="password-expired"></a>
<details>
<summary>42. Expired password link recovery</summary>

Audit findings: 26.

| Before 42 | After 42 |
| --- | --- |
| ![Before 42: Expired password link recovery](images/dashboard/password-expired-before.png) | ![After 42: Expired password link recovery](images/dashboard/password-expired-after.png) |

</details>

<a id="password-network"></a>
<details>
<summary>43. Form-level password network errors</summary>

Audit findings: 26.

| Before 43 | After 43 |
| --- | --- |
| ![Before 43: Form-level password network errors](images/dashboard/password-network-before.png) | ![After 43: Form-level password network errors](images/dashboard/password-network-after.png) |

</details>
