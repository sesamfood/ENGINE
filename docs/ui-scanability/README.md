# UI scanability screenshots

All 26 findings from the [source review](https://l2hkhnjfexwi.postplan.dev) are covered by the before/after pairs below.

These are browser captures of the actual React components. A temporary Vite harness supplies deterministic session, query and action fixtures; it does not connect to customer data or provider accounts. Both versions use the same fixture data, interactions, viewport, timezone and app fonts. Live authentication and provider flows remain unverified.

Before: `54a1d5b0cdfc727887345014b682281519f9cc2b`. After: the implementation in this branch. Captures use Chromium through Playwright, with the clock set to 23 September 2026 at 14:00 Europe/Copenhagen. Most pairs use a 1280px viewport; the schedule uses 744px and the scrolled permissions view uses 1024px. Long administration pages use viewport captures at the relevant section; other pages use full-page captures.

Validation: production build and TypeScript, ESLint, all 86 existing tests, and browser interaction checks for user/stock/provider filters, permission change/revert cues, reason gating, and keyboard history actions. Additional phone/tablet checks covered 390px, 744px and 768px layouts. No production preview routes or new test dependencies were added.


| Finding | Screenshot coverage |
| --- | --- |
| 1 | [Ordering warnings and quantity columns](#operations-ordering) |
| 2 | [Overdue checks and due dates](#own-checks-overdue) |
| 3 | [Changed permissions and save controls](#permissions) · [Permission context while scrolling](#permissions-scroll) |
| 4 | [User search, roles and location access](#members) |
| 5 | [Count product names](#operations-count) · [Waste product names and action emphasis](#operations-waste) · [Stock product names, search and categories](#operations-stock) |
| 6 | [Metric picker and selected calculation help](#metric-picker) |
| 7 | [Sent and received quantity labels](#operations-receipt) |
| 8 | [Named location actions](#locations) |
| 9 | [Active and archived catalogue views](#catalog-status) |
| 10 | [Shared dashboard location and period context](#shared-dashboard) · [Named widget actions and period override](#dashboard-widget-settings) |
| 11 | [Readable labels in small comparison widgets](#compact-charts) · [Disclosed chart group limits](#chart-groups-limit) |
| 12 | [Waste product names and action emphasis](#operations-waste) · [Staff food action emphasis](#operations-staff-food) · [Label preparation actions](#operations-labels) |
| 13 | [Ordering warnings and quantity columns](#operations-ordering) · [Waste quantity alignment and details](#operations-waste-report) · [Bad-delivery quantity alignment and details](#operations-bad-detail) |
| 14 | [Waste quantity alignment and details](#operations-waste-report) · [Bad-delivery quantity alignment and details](#operations-bad-detail) · [Transfer details and temperature exceptions](#operations-transfer-history) |
| 15 | [Stock product names, search and categories](#operations-stock) |
| 16 | [Label preparation actions](#operations-labels) · [Label preparation and print preview](#operations-label-preview) |
| 17 | [Activation and connection status](#integrations) |
| 18 | [OnlinePOS connection attention list](#onlinepos-connections) · [OnlinePOS product mapping filter](#onlinepos-mappings) · [Visible missing menu mappings](#onlinepos-menus) · [Workfeed mapping attention list](#workfeed-mappings) · [e-conomic agreement attention list](#economic-connections) · [Wolt connection attention list](#wolt-connections) · [Wolt mapping state and editing](#wolt-mappings) |
| 19 | [Product unit rows](#recipe-units) · [Shared ingredient columns and quieter guidance](#recipe-ingredients) |
| 20 | [Transfer product groups](#operations-transfer) · [Invoice products within menu boundaries](#operations-invoice) · [Bad-delivery product groups](#operations-bad-registration) |
| 21 | [Pending transfers grouped by date](#operations-pending) |
| 22 | [Visible single-location action](#dashboard-location-picker) · [Named widget actions and period override](#dashboard-widget-settings) |
| 23 | [Today selected and scheduled employees first](#employee-schedule) |
| 24 | [Open deviations and follow-up actions first](#own-check-follow-up) |
| 25 | [Order columns, quiet mapping state and product IDs](#wolt-order) |
| 26 | [Password confirmation errors](#password-mismatch) · [Expired password link recovery](#password-expired) · [Form-level password network errors](#password-network) |

<a id="operations-ordering"></a>
<details>
<summary>Ordering warnings and quantity columns — findings 1, 13</summary>

| Before | After |
| --- | --- |
| ![Before: Ordering warnings and quantity columns](images/operations/operations-ordering-before.png) | ![After: Ordering warnings and quantity columns](images/operations/operations-ordering-after.png) |

</details>

<a id="own-checks-overdue"></a>
<details>
<summary>Overdue checks and due dates — findings 2</summary>

| Before | After |
| --- | --- |
| ![Before: Overdue checks and due dates](images/dashboard/own-checks-overdue-before.png) | ![After: Overdue checks and due dates](images/dashboard/own-checks-overdue-after.png) |

</details>

<a id="permissions"></a>
<details>
<summary>Changed permissions and save controls — findings 3</summary>

| Before | After |
| --- | --- |
| ![Before: Changed permissions and save controls](images/root/permissions-before.png) | ![After: Changed permissions and save controls](images/root/permissions-after.png) |

</details>

<a id="permissions-scroll"></a>
<details>
<summary>Permission context while scrolling — findings 3</summary>

| Before | After |
| --- | --- |
| ![Before: Permission context while scrolling](images/root/permissions-scroll-before.png) | ![After: Permission context while scrolling](images/root/permissions-scroll-after.png) |

</details>

<a id="members"></a>
<details>
<summary>User search, roles and location access — findings 4</summary>

| Before | After |
| --- | --- |
| ![Before: User search, roles and location access](images/root/members-before.png) | ![After: User search, roles and location access](images/root/members-after.png) |

</details>

<a id="operations-count"></a>
<details>
<summary>Count product names — findings 5</summary>

| Before | After |
| --- | --- |
| ![Before: Count product names](images/operations/operations-count-before.png) | ![After: Count product names](images/operations/operations-count-after.png) |

</details>

<a id="operations-waste"></a>
<details>
<summary>Waste product names and action emphasis — findings 5, 12</summary>

| Before | After |
| --- | --- |
| ![Before: Waste product names and action emphasis](images/operations/operations-waste-before.png) | ![After: Waste product names and action emphasis](images/operations/operations-waste-after.png) |

</details>

<a id="operations-stock"></a>
<details>
<summary>Stock product names, search and categories — findings 5, 15</summary>

| Before | After |
| --- | --- |
| ![Before: Stock product names, search and categories](images/operations/operations-stock-before.png) | ![After: Stock product names, search and categories](images/operations/operations-stock-after.png) |

</details>

<a id="metric-picker"></a>
<details>
<summary>Metric picker and selected calculation help — findings 6</summary>

| Before | After |
| --- | --- |
| ![Before: Metric picker and selected calculation help](images/dashboard/metric-picker-before.png) | ![After: Metric picker and selected calculation help](images/dashboard/metric-picker-after.png) |

</details>

<a id="operations-receipt"></a>
<details>
<summary>Sent and received quantity labels — findings 7</summary>

| Before | After |
| --- | --- |
| ![Before: Sent and received quantity labels](images/operations/operations-receipt-before.png) | ![After: Sent and received quantity labels](images/operations/operations-receipt-after.png) |

</details>

<a id="locations"></a>
<details>
<summary>Named location actions — findings 8</summary>

| Before | After |
| --- | --- |
| ![Before: Named location actions](images/administration-focused/locations-before.png) | ![After: Named location actions](images/administration-focused/locations-after.png) |

</details>

<a id="catalog-status"></a>
<details>
<summary>Active and archived catalogue views — findings 9</summary>

| Before | After |
| --- | --- |
| ![Before: Active and archived catalogue views](images/administration-focused/catalog-status-before.png) | ![After: Active and archived catalogue views](images/administration-focused/catalog-status-after.png) |

</details>

<a id="shared-dashboard"></a>
<details>
<summary>Shared dashboard location and period context — findings 10</summary>

| Before | After |
| --- | --- |
| ![Before: Shared dashboard location and period context](images/dashboard/shared-dashboard-before.png) | ![After: Shared dashboard location and period context](images/dashboard/shared-dashboard-after.png) |

</details>

<a id="compact-charts"></a>
<details>
<summary>Readable labels in small comparison widgets — findings 11</summary>

| Before | After |
| --- | --- |
| ![Before: Readable labels in small comparison widgets](images/dashboard/compact-charts-before.png) | ![After: Readable labels in small comparison widgets](images/dashboard/compact-charts-after.png) |

</details>

<a id="chart-groups-limit"></a>
<details>
<summary>Disclosed chart group limits — findings 11</summary>

| Before | After |
| --- | --- |
| ![Before: Disclosed chart group limits](images/dashboard/chart-groups-limit-before.png) | ![After: Disclosed chart group limits](images/dashboard/chart-groups-limit-after.png) |

</details>

<a id="operations-staff-food"></a>
<details>
<summary>Staff food action emphasis — findings 12</summary>

| Before | After |
| --- | --- |
| ![Before: Staff food action emphasis](images/operations/operations-staff-food-before.png) | ![After: Staff food action emphasis](images/operations/operations-staff-food-after.png) |

</details>

<a id="operations-labels"></a>
<details>
<summary>Label preparation actions — findings 12, 16</summary>

| Before | After |
| --- | --- |
| ![Before: Label preparation actions](images/operations/operations-labels-before.png) | ![After: Label preparation actions](images/operations/operations-labels-after.png) |

</details>

<a id="operations-label-preview"></a>
<details>
<summary>Label preparation and print preview — findings 16</summary>

| Before | After |
| --- | --- |
| ![Before: Label preparation and print preview](images/operations/operations-label-preview-before.png) | ![After: Label preparation and print preview](images/operations/operations-label-preview-after.png) |

</details>

<a id="operations-waste-report"></a>
<details>
<summary>Waste quantity alignment and details — findings 13, 14</summary>

| Before | After |
| --- | --- |
| ![Before: Waste quantity alignment and details](images/operations/operations-waste-report-before.png) | ![After: Waste quantity alignment and details](images/operations/operations-waste-report-after.png) |

</details>

<a id="operations-bad-detail"></a>
<details>
<summary>Bad-delivery quantity alignment and details — findings 13, 14</summary>

| Before | After |
| --- | --- |
| ![Before: Bad-delivery quantity alignment and details](images/operations/operations-bad-detail-before.png) | ![After: Bad-delivery quantity alignment and details](images/operations/operations-bad-detail-after.png) |

</details>

<a id="operations-transfer-history"></a>
<details>
<summary>Transfer details and temperature exceptions — findings 14</summary>

| Before | After |
| --- | --- |
| ![Before: Transfer details and temperature exceptions](images/operations/operations-transfer-history-before.png) | ![After: Transfer details and temperature exceptions](images/operations/operations-transfer-history-after.png) |

</details>

<a id="integrations"></a>
<details>
<summary>Activation and connection status — findings 17</summary>

| Before | After |
| --- | --- |
| ![Before: Activation and connection status](images/root/integrations-before.png) | ![After: Activation and connection status](images/root/integrations-after.png) |

</details>

<a id="onlinepos-connections"></a>
<details>
<summary>OnlinePOS connection attention list — findings 18</summary>

| Before | After |
| --- | --- |
| ![Before: OnlinePOS connection attention list](images/administration-focused/onlinepos-connections-before.png) | ![After: OnlinePOS connection attention list](images/administration-focused/onlinepos-connections-after.png) |

</details>

<a id="onlinepos-mappings"></a>
<details>
<summary>OnlinePOS product mapping filter — findings 18</summary>

| Before | After |
| --- | --- |
| ![Before: OnlinePOS product mapping filter](images/administration-focused/onlinepos-mappings-before.png) | ![After: OnlinePOS product mapping filter](images/administration-focused/onlinepos-mappings-after.png) |

</details>

<a id="onlinepos-menus"></a>
<details>
<summary>Visible missing menu mappings — findings 18</summary>

| Before | After |
| --- | --- |
| ![Before: Visible missing menu mappings](images/administration-focused/onlinepos-menus-before.png) | ![After: Visible missing menu mappings](images/administration-focused/onlinepos-menus-after.png) |

</details>

<a id="workfeed-mappings"></a>
<details>
<summary>Workfeed mapping attention list — findings 18</summary>

| Before | After |
| --- | --- |
| ![Before: Workfeed mapping attention list](images/administration-focused/workfeed-mappings-before.png) | ![After: Workfeed mapping attention list](images/administration-focused/workfeed-mappings-after.png) |

</details>

<a id="economic-connections"></a>
<details>
<summary>e-conomic agreement attention list — findings 18</summary>

| Before | After |
| --- | --- |
| ![Before: e-conomic agreement attention list](images/administration-focused/economic-connections-before.png) | ![After: e-conomic agreement attention list](images/administration-focused/economic-connections-after.png) |

</details>

<a id="wolt-connections"></a>
<details>
<summary>Wolt connection attention list — findings 18</summary>

| Before | After |
| --- | --- |
| ![Before: Wolt connection attention list](images/administration-focused/wolt-connections-before.png) | ![After: Wolt connection attention list](images/administration-focused/wolt-connections-after.png) |

</details>

<a id="wolt-mappings"></a>
<details>
<summary>Wolt mapping state and editing — findings 18</summary>

| Before | After |
| --- | --- |
| ![Before: Wolt mapping state and editing](images/administration-focused/wolt-mappings-before.png) | ![After: Wolt mapping state and editing](images/administration-focused/wolt-mappings-after.png) |

</details>

<a id="recipe-units"></a>
<details>
<summary>Product unit rows — findings 19</summary>

| Before | After |
| --- | --- |
| ![Before: Product unit rows](images/administration-focused/recipe-units-before.png) | ![After: Product unit rows](images/administration-focused/recipe-units-after.png) |

</details>

<a id="recipe-ingredients"></a>
<details>
<summary>Shared ingredient columns and quieter guidance — findings 19</summary>

| Before | After |
| --- | --- |
| ![Before: Shared ingredient columns and quieter guidance](images/administration-focused/recipe-ingredients-before.png) | ![After: Shared ingredient columns and quieter guidance](images/administration-focused/recipe-ingredients-after.png) |

</details>

<a id="operations-transfer"></a>
<details>
<summary>Transfer product groups — findings 20</summary>

| Before | After |
| --- | --- |
| ![Before: Transfer product groups](images/operations/operations-transfer-before.png) | ![After: Transfer product groups](images/operations/operations-transfer-after.png) |

</details>

<a id="operations-invoice"></a>
<details>
<summary>Invoice products within menu boundaries — findings 20</summary>

| Before | After |
| --- | --- |
| ![Before: Invoice products within menu boundaries](images/operations/operations-invoice-before.png) | ![After: Invoice products within menu boundaries](images/operations/operations-invoice-after.png) |

</details>

<a id="operations-bad-registration"></a>
<details>
<summary>Bad-delivery product groups — findings 20</summary>

| Before | After |
| --- | --- |
| ![Before: Bad-delivery product groups](images/operations/operations-bad-registration-before.png) | ![After: Bad-delivery product groups](images/operations/operations-bad-registration-after.png) |

</details>

<a id="operations-pending"></a>
<details>
<summary>Pending transfers grouped by date — findings 21</summary>

| Before | After |
| --- | --- |
| ![Before: Pending transfers grouped by date](images/operations/operations-pending-before.png) | ![After: Pending transfers grouped by date](images/operations/operations-pending-after.png) |

</details>

<a id="dashboard-location-picker"></a>
<details>
<summary>Visible single-location action — findings 22</summary>

| Before | After |
| --- | --- |
| ![Before: Visible single-location action](images/dashboard/dashboard-location-picker-before.png) | ![After: Visible single-location action](images/dashboard/dashboard-location-picker-after.png) |

</details>

<a id="dashboard-widget-settings"></a>
<details>
<summary>Named widget actions and period override — findings 10, 22</summary>

| Before | After |
| --- | --- |
| ![Before: Named widget actions and period override](images/dashboard/dashboard-widget-settings-before.png) | ![After: Named widget actions and period override](images/dashboard/dashboard-widget-settings-after.png) |

</details>

<a id="employee-schedule"></a>
<details>
<summary>Today selected and scheduled employees first — findings 23</summary>

| Before | After |
| --- | --- |
| ![Before: Today selected and scheduled employees first](images/dashboard/employee-schedule-before.png) | ![After: Today selected and scheduled employees first](images/dashboard/employee-schedule-after.png) |

</details>

<a id="own-check-follow-up"></a>
<details>
<summary>Open deviations and follow-up actions first — findings 24</summary>

| Before | After |
| --- | --- |
| ![Before: Open deviations and follow-up actions first](images/dashboard/own-check-follow-up-before.png) | ![After: Open deviations and follow-up actions first](images/dashboard/own-check-follow-up-after.png) |

</details>

<a id="wolt-order"></a>
<details>
<summary>Order columns, quiet mapping state and product IDs — findings 25</summary>

| Before | After |
| --- | --- |
| ![Before: Order columns, quiet mapping state and product IDs](images/administration-focused/wolt-order-before.png) | ![After: Order columns, quiet mapping state and product IDs](images/administration-focused/wolt-order-after.png) |

</details>

<a id="password-mismatch"></a>
<details>
<summary>Password confirmation errors — findings 26</summary>

| Before | After |
| --- | --- |
| ![Before: Password confirmation errors](images/dashboard/password-mismatch-before.png) | ![After: Password confirmation errors](images/dashboard/password-mismatch-after.png) |

</details>

<a id="password-expired"></a>
<details>
<summary>Expired password link recovery — findings 26</summary>

| Before | After |
| --- | --- |
| ![Before: Expired password link recovery](images/dashboard/password-expired-before.png) | ![After: Expired password link recovery](images/dashboard/password-expired-after.png) |

</details>

<a id="password-network"></a>
<details>
<summary>Form-level password network errors — findings 26</summary>

| Before | After |
| --- | --- |
| ![Before: Form-level password network errors](images/dashboard/password-network-before.png) | ![After: Form-level password network errors](images/dashboard/password-network-after.png) |

</details>
