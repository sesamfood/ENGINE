# UI scanability screenshots

These 20 before/after pairs cover every change remaining in the PR. Original pair numbers are preserved, including gaps, so earlier selections still apply.

Before: `54a1d5b0cdfc727887345014b682281519f9cc2b`. After: the current implementation in this branch.

These are browser captures of the actual React components with deterministic session, query and action fixtures in a temporary Vite harness. Both versions use the same fixture data, interactions, viewport and app fonts. They do not connect to customer data or provider accounts; live authentication and provider flows remain unverified.

Captures use Playwright and Chromium, with the clock fixed to 23 September 2026 at 14:00 Europe/Copenhagen. Most pairs use a 1280px viewport; the schedule uses 744px and scrolled permissions use 1024px. Captures show the full page or the relevant section; image dimensions are recorded in `captures.json`.

Validation: production build including TypeScript, ESLint, all 86 existing tests, and browser checks for user filters, permission scrolling and reason gating, keyboard access to bad-delivery details, metric cards and visible own-check instructions. The catalogue search and status controls share a row at 1280px and 768px and wrap at 390px. No production preview routes or test dependencies were added.

| Pair | Change |
| --- | --- |
| 2 | [Overdue checks and due dates](#own-checks-overdue) |
| 4 | [Frozen permission labels and role headings](#permissions-scroll) |
| 5 | [User search, roles and location access](#members) |
| 9 | [Metric cards without formulas](#metric-picker) |
| 11 | [Named location actions](#locations) |
| 12 | [Catalogue status beside search](#catalog-status) |
| 16 | [Staff food action emphasis](#operations-staff-food) |
| 18 | [Label preparation wording and print preview](#operations-label-preview) |
| 20 | [Bad-delivery quantity alignment and details](#operations-bad-detail) |
| 22 | [Activation and connection status](#integrations) |
| 23 | [OnlinePOS connection attention list](#onlinepos-connections) |
| 24 | [OnlinePOS product mapping filter](#onlinepos-mappings) |
| 27 | [e-conomic agreement attention list](#economic-connections) |
| 28 | [Wolt connection attention list](#wolt-connections) |
| 29 | [Wolt mapping state and editing](#wolt-mappings) |
| 38 | [Today selected and scheduled employees first](#employee-schedule) |
| 39 | [Open follow-up first with visible instructions](#own-check-follow-up) |
| 41 | [Password confirmation errors](#password-mismatch) |
| 42 | [Expired password link recovery](#password-expired) |
| 43 | [Form-level password network errors](#password-network) |

<a id="own-checks-overdue"></a>
<details>
<summary>2. Overdue checks and due dates</summary>

| Before 2 | After 2 |
| --- | --- |
| ![Before 2: Overdue checks and due dates](images/dashboard/own-checks-overdue-before.png) | ![After 2: Overdue checks and due dates](images/dashboard/own-checks-overdue-after.png) |

</details>

<a id="permissions-scroll"></a>
<details>
<summary>4. Frozen permission labels and role headings</summary>

Permission labels and role headings stay visible while scrolling. Change highlights and the sticky save bar are reverted.

| Before 4 | After 4 |
| --- | --- |
| ![Before 4: Frozen permission labels and role headings](images/root/permissions-scroll-before.png) | ![After 4: Frozen permission labels and role headings](images/root/permissions-scroll-after.png) |

</details>

<a id="members"></a>
<details>
<summary>5. User search, roles and location access</summary>

| Before 5 | After 5 |
| --- | --- |
| ![Before 5: User search, roles and location access](images/root/members-before.png) | ![After 5: User search, roles and location access](images/root/members-after.png) |

</details>

<a id="metric-picker"></a>
<details>
<summary>9. Metric cards without formulas</summary>

The original metric cards remain, with their descriptions and data sources. Only formula text is removed.

| Before 9 | After 9 |
| --- | --- |
| ![Before 9: Metric cards without formulas](images/dashboard/metric-picker-before.png) | ![After 9: Metric cards without formulas](images/dashboard/metric-picker-after.png) |

</details>

<a id="locations"></a>
<details>
<summary>11. Named location actions</summary>

| Before 11 | After 11 |
| --- | --- |
| ![Before 11: Named location actions](images/administration-focused/locations-before.png) | ![After 11: Named location actions](images/administration-focused/locations-after.png) |

</details>

<a id="catalog-status"></a>
<details>
<summary>12. Catalogue status beside search</summary>

Active and archived controls sit beside search on tablet and desktop, and wrap on narrow phones.

| Before 12 | After 12 |
| --- | --- |
| ![Before 12: Catalogue status beside search](images/administration-focused/catalog-status-before.png) | ![After 12: Catalogue status beside search](images/administration-focused/catalog-status-after.png) |

</details>

<a id="operations-staff-food"></a>
<details>
<summary>16. Staff food action emphasis</summary>

| Before 16 | After 16 |
| --- | --- |
| ![Before 16: Staff food action emphasis](images/operations/operations-staff-food-before.png) | ![After 16: Staff food action emphasis](images/operations/operations-staff-food-after.png) |

</details>

<a id="operations-label-preview"></a>
<details>
<summary>18. Label preparation wording and print preview</summary>

Card buttons retain their original emphasis and use “Klargør etiket”.

| Before 18 | After 18 |
| --- | --- |
| ![Before 18: Label preparation wording and print preview](images/operations/operations-label-preview-before.png) | ![After 18: Label preparation wording and print preview](images/operations/operations-label-preview-after.png) |

</details>

<a id="operations-bad-detail"></a>
<details>
<summary>20. Bad-delivery quantity alignment and details</summary>

| Before 20 | After 20 |
| --- | --- |
| ![Before 20: Bad-delivery quantity alignment and details](images/operations/operations-bad-detail-before.png) | ![After 20: Bad-delivery quantity alignment and details](images/operations/operations-bad-detail-after.png) |

</details>

<a id="integrations"></a>
<details>
<summary>22. Activation and connection status</summary>

| Before 22 | After 22 |
| --- | --- |
| ![Before 22: Activation and connection status](images/root/integrations-before.png) | ![After 22: Activation and connection status](images/root/integrations-after.png) |

</details>

<a id="onlinepos-connections"></a>
<details>
<summary>23. OnlinePOS connection attention list</summary>

| Before 23 | After 23 |
| --- | --- |
| ![Before 23: OnlinePOS connection attention list](images/administration-focused/onlinepos-connections-before.png) | ![After 23: OnlinePOS connection attention list](images/administration-focused/onlinepos-connections-after.png) |

</details>

<a id="onlinepos-mappings"></a>
<details>
<summary>24. OnlinePOS product mapping filter</summary>

| Before 24 | After 24 |
| --- | --- |
| ![Before 24: OnlinePOS product mapping filter](images/administration-focused/onlinepos-mappings-before.png) | ![After 24: OnlinePOS product mapping filter](images/administration-focused/onlinepos-mappings-after.png) |

</details>

<a id="economic-connections"></a>
<details>
<summary>27. e-conomic agreement attention list</summary>

| Before 27 | After 27 |
| --- | --- |
| ![Before 27: e-conomic agreement attention list](images/administration-focused/economic-connections-before.png) | ![After 27: e-conomic agreement attention list](images/administration-focused/economic-connections-after.png) |

</details>

<a id="wolt-connections"></a>
<details>
<summary>28. Wolt connection attention list</summary>

| Before 28 | After 28 |
| --- | --- |
| ![Before 28: Wolt connection attention list](images/administration-focused/wolt-connections-before.png) | ![After 28: Wolt connection attention list](images/administration-focused/wolt-connections-after.png) |

</details>

<a id="wolt-mappings"></a>
<details>
<summary>29. Wolt mapping state and editing</summary>

| Before 29 | After 29 |
| --- | --- |
| ![Before 29: Wolt mapping state and editing](images/administration-focused/wolt-mappings-before.png) | ![After 29: Wolt mapping state and editing](images/administration-focused/wolt-mappings-after.png) |

</details>

<a id="employee-schedule"></a>
<details>
<summary>38. Today selected and scheduled employees first</summary>

| Before 38 | After 38 |
| --- | --- |
| ![Before 38: Today selected and scheduled employees first](images/dashboard/employee-schedule-before.png) | ![After 38: Today selected and scheduled employees first](images/dashboard/employee-schedule-after.png) |

</details>

<a id="own-check-follow-up"></a>
<details>
<summary>39. Open follow-up first with visible instructions</summary>

Open deviations and follow-up actions appear first. Instructions remain expanded, before the control points.

| Before 39 | After 39 |
| --- | --- |
| ![Before 39: Open follow-up first with visible instructions](images/dashboard/own-check-follow-up-before.png) | ![After 39: Open follow-up first with visible instructions](images/dashboard/own-check-follow-up-after.png) |

</details>

<a id="password-mismatch"></a>
<details>
<summary>41. Password confirmation errors</summary>

| Before 41 | After 41 |
| --- | --- |
| ![Before 41: Password confirmation errors](images/dashboard/password-mismatch-before.png) | ![After 41: Password confirmation errors](images/dashboard/password-mismatch-after.png) |

</details>

<a id="password-expired"></a>
<details>
<summary>42. Expired password link recovery</summary>

| Before 42 | After 42 |
| --- | --- |
| ![Before 42: Expired password link recovery](images/dashboard/password-expired-before.png) | ![After 42: Expired password link recovery](images/dashboard/password-expired-after.png) |

</details>

<a id="password-network"></a>
<details>
<summary>43. Form-level password network errors</summary>

| Before 43 | After 43 |
| --- | --- |
| ![Before 43: Form-level password network errors](images/dashboard/password-network-before.png) | ![After 43: Form-level password network errors](images/dashboard/password-network-after.png) |

</details>

Model: GPT-6 Codex. Browser harness: temporary Vite fixtures, Playwright and Chromium.
