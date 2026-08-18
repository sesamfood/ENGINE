# Dashboard v2 — specification

Settled 2026-08-18 in a grilling session. Twenty-one decisions, listed in §1.
The project is **pre-launch**: no production data has to survive this work.

Supersedes the per-user dashboard described by the current `dashboards` table.
Read alongside `AGENTS.md` (§ Dashboard widgets) and
`convex/_generated/ai/guidelines.md`.

---

## 1. Decisions

| #   | Decision                                                                                 |
| --- | ---------------------------------------------------------------------------------------- |
| 1   | Discard all existing private dashboards; seed one organization dashboard from `defaultWidgets` |
| 2   | New `dashboard.manage` permission gates every write; `dashboard.view` is read-only        |
| 3   | Viewers change scope and range transiently via URL state, never persisted                 |
| 4   | Dashboard access by role allowlist (`roleIds`, empty = all roles)                          |
| 5   | Tab switcher, reusing the `waste-registration.tsx` category-tab pattern                    |
| 6   | Cap 8 dashboards; trailing `+` tab creates, drag to reorder, settings icon on active tab   |
| 7   | Tab strip shows every dashboard the role allows; defaults only choose the selected tab     |
| 8   | Share links stay snapshots, as today                                                       |
| 9   | Landing order: last viewed → role default → location default → org default → first allowed |
| 10  | Builder opens all nine datasets, ratios included in v1                                     |
| 11  | Employee dimension blocked entirely at `anonymous` granularity                             |
| 12  | Zero denominator blanks the point; unit derived from the pair; totals divide sums          |
| 13  | Deleting a metric in use warns with usages, then cascades to remove those widgets          |
| 14  | All 18 built-in metrics survive as curated presets                                         |
| 15  | Per-widget range: follow board, or pin an absolute preset — field and UI both in v1        |
| 16  | Add a raw `/exportSales/v20` response inspector to the OnlinePOS panel, gated on `integrations.manage` |
| 17  | Once the response is understood, switch `requestSales` to v20 and capture `clerk` + `pnumber` |
| 18  | Expose `clerk` as a raw "Kasserer" dimension. **No clerk-to-employee mapping** until the value is understood |
| 19  | Forward-only clerk capture, plus a manual backfill on the OnlinePOS panel, 90 days per run |
| 20  | "Dashboard" everywhere; change the five `Overblikket` strings in Convex to `Dashboardet`   |
| 21  | Pre-launch — reshape tables directly, no widen-migrate-narrow                              |

### Out of scope

Personal dashboards, drill-down from a widget, CSV export, targets and
thresholds, scheduled digests, dashboard templates, comparison-period selector.
Recorded in §11 as deferred, not rejected.

---

## 2. Data model

### 2.1 `dashboards` (reshaped)

`userIdentifier` is dropped. A dashboard is organization-owned.

```ts
dashboards: defineTable({
  organizationId: v.string(),
  name: v.string(),
  normalizedName: v.string(),
  widgets: v.array(widgetValidator),
  defaultScope: scopeValidator,
  defaultRange: rangeValidator,
  roleIds: v.array(v.string()),               // empty = every role
  defaultForRoleIds: v.array(v.string()),
  defaultForLocationIds: v.array(v.id("locations")),
  isOrganizationDefault: v.boolean(),
  sortOrder: v.number(),
  createdBy: v.string(),
  updatedBy: v.string(),
  updatedAt: v.number(),
})
  .index("by_organizationId_and_normalizedName", ["organizationId", "normalizedName"])
  .index("by_organizationId_and_sortOrder", ["organizationId", "sortOrder"]),
```

Invariants, enforced in the write path:

- At most 8 dashboards per organization.
- `normalizedName` unique per organization.
- Exactly one dashboard has `isOrganizationDefault: true`.
- A location id appears in at most one dashboard's `defaultForLocationIds`.
- A role id appears in at most one dashboard's `defaultForRoleIds`.
- A role in `defaultForRoleIds` must also be allowed by `roleIds`.
- Existing widget rules carry over unchanged: ≤ 24 widgets, unique keys,
  no overlap, visualization supported by the metric, `limit` 1–50,
  `yAxisMin < yAxisMax`.

### 2.2 `widgetValidator` (reshaped)

```ts
{
  key: v.string(),
  metric: v.union(
    v.object({ kind: v.literal("builtin"), id: metricIdValidator }),
    v.object({ kind: v.literal("custom"),  id: v.id("customMetrics") }),
  ),
  visualization: visualizationValidator,
  size: widgetSizeValidator,
  position: v.optional(v.object({ column: v.number(), row: v.number() })),
  range: v.optional(widgetRangePresetValidator),  // absent = follow the board
  options: v.optional(v.object({
    limit: v.optional(v.number()),
    yAxisMin: v.optional(v.number()),
    yAxisMax: v.optional(v.number()),
  })),
}
```

`widgetRangePresetValidator` is `rangePresets` minus `"custom"`: a pinned widget
may not hold fixed dates, so it can never go stale.

### 2.3 `customMetrics` (new)

```ts
customMetrics: defineTable({
  organizationId: v.string(),
  name: v.string(),
  normalizedName: v.string(),
  description: v.optional(v.string()),
  spec: customMetricSpecValidator,
  createdBy: v.string(),
  updatedBy: v.string(),
  updatedAt: v.number(),
}).index("by_organizationId_and_normalizedName", ["organizationId", "normalizedName"]),
```

```ts
const querySpecValidator = v.object({
  dataset: datasetIdValidator,
  measure: v.string(),
  filters: v.array(v.object({
    field: v.string(),
    op: v.union(v.literal("in"), v.literal("notIn")),
    values: v.array(v.string()),
  })),
});

const customMetricSpecValidator = v.union(
  v.object({
    kind: v.literal("single"),
    query: querySpecValidator,
    dimension: v.optional(v.string()),
    bucket: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
    limit: v.optional(v.number()),          // top-N, default 10, max 50
  }),
  v.object({
    kind: v.literal("ratio"),
    numerator: querySpecValidator,
    denominator: querySpecValidator,
    dimension: v.optional(v.string()),      // must exist on both datasets
    bucket: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
    limit: v.optional(v.number()),
  }),
);
```

Cap: 50 custom metrics per organization.

### 2.4 Sales tables (extended)

OnlinePOS documents `clerk` as *"the clerk who received payment for the order
line"* — it is line-level, so a split-payment order can span clerks.

```ts
salesLines:  + externalClerkId: v.optional(v.string()),
             + clerkName: v.optional(v.string()),
salesOrders: + externalClerkId: v.optional(v.string()),   // only when all lines agree
```

`salesLines` is authoritative for anything per-clerk. `salesOrders.externalClerkId`
exists for cheap order-level grouping and is left undefined when the order's
lines disagree.

### 2.5 No clerk mapping table

There is deliberately **no** `onlinePosClerkMappings` table in this release.
Clerk values are stored raw on `salesLines` and grouped by their raw value.
Linking a clerk to an `employees` row is deferred until §6.1 establishes what
OnlinePOS actually returns — see §11.

### 2.6 `dashboardShares` (extended)

Add `dashboardId: v.id("dashboards")` for provenance. The share stays a full
snapshot of widgets, scope and range; later edits to the dashboard do not
change an issued link.

---

## 3. Permissions

Add to the `Dashboard` group in `lib/auth-permissions.ts`:

```ts
{ id: "dashboard.manage", label: "Administrere dashboards" },
```

- `admin` receives it automatically (`admin: permissionIds`).
- `manager` must exclude it — add `id !== "dashboard.manage"` to the filter in
  `defaultRolePermissions.manager`.
- `member` is an explicit list and needs no change.

Every write path calls `requirePermission(ctx, "dashboard.manage")`:
create, rename, delete, duplicate, reorder, save widgets, save defaults,
set role access, set defaults, and all custom-metric mutations.

`dashboard.view` grants read only. Client-side hiding of the edit affordances is
usability, not a boundary.

### Unchanged guarantees

Dashboard access must never widen data access. Per-widget filtering stays exactly
as it is today:

- per-member location scope (`auth.locationScope`) resolved server-side,
- role `granularity` (`detail` / `aggregate` / `anonymous`),
- `sensitive` metrics gated behind `dashboard.viewSales` / `sales.viewAggregate` /
  `sales.viewDetail`.

A dashboard says *what is asked*. The server keeps deciding *what is answered*.

If every widget on a dashboard is unavailable to the caller, hide the tab
entirely. On direct navigation show:
"Ingen af dette dashboards widgets er tilgængelige for dig."

---

## 4. Interface

### 4.1 Tab switcher

Reuse the pattern at `components/waste/waste-registration.tsx:427`:

```tsx
<Tabs value={dashboardId} onValueChange={…}>
  <TabsList className="h-12 w-full justify-start overflow-x-auto" aria-label="Dashboards">
    {dashboards.map((d) => (
      <TabsTrigger key={d.id} value={d.id} className="min-w-28 shrink-0 px-4">
        {d.name}
      </TabsTrigger>
    ))}
    {canManage ? <TabsTrigger value="new" className="min-w-12 shrink-0 px-4">＋</TabsTrigger> : null}
  </TabsList>
</Tabs>
```

Placement: directly under the page header, above the range/scope card.
Switching a tab navigates to `/dashboard/[dashboardId]`, preserving the current
range and scope query parameters.

Admins reorder by dragging a tab. `@dnd-kit/core` is already a dependency and
already carries a `KeyboardSensor` in `dashboard-grid.tsx`; reuse the same
sensor set so reordering stays keyboard-operable.

### 4.2 Dashboard settings dialog

A settings icon on the **active** tab, visible only with `dashboard.manage`.
One dialog, all of it:

- Navn
- Adgang — role multi-select, empty means "Alle roller"
- Standard for roller — role multi-select
- Standard for lokationer — location multi-select
- Standard for organisationen — switch
- Duplikér
- Slet (confirmation naming the dashboard)

### 4.3 Editing

The existing "Rediger" toggle, add-widget dialog and drag-to-arrange grid are
unchanged in behaviour, but are rendered only with `dashboard.manage`.

"Gem som standard" appears while editing and promotes the currently viewed
scope and range into `defaultScope` / `defaultRange`.

### 4.4 Viewer state

Scope and range live in the URL and are never written to Convex:

```
/dashboard/<id>?range=30days
/dashboard/<id>?range=custom&from=2026-07-01&to=2026-07-31
/dashboard/<id>?mode=compare&loc=<id>,<id>
/dashboard/<id>?level=market&parent=<id>
```

Absent parameters fall back to the dashboard's stored defaults. The last viewed
dashboard id is kept in `localStorage`, nothing else.

This removes the per-keystroke `saveConfigRevisioned` loop for every user who
cannot edit. Optimistic concurrency on `updatedAt` is retained for admin saves.

### 4.5 Default resolution

On `/dashboard`, resolve in order and redirect to `/dashboard/[id]`:

1. last viewed (`localStorage`), if it still exists and the role still allows it
2. the dashboard whose `defaultForRoleIds` contains the member's role
3. the dashboard whose `defaultForLocationIds` contains the member's location —
   applied only when the member resolves to exactly one location, i.e. a kiosk
   account (`auth.kioskLocationId`) or a location scope of size one
4. `isOrganizationDefault`
5. first accessible by `sortOrder`

---

## 5. Custom metric builder

### 5.1 Principle

Curated datasets, never raw table access. Convex has no ad-hoc query planner: a
filter without a matching index is a table scan. The builder may only express
queries the dataset registry declares an index for.

Two properties make this safe:

- **The tables are already denormalized.** `wasteRegistrations`,
  `staffFoodRegistrations`, `transferItems` and `salesLines` carry
  `productName`, `locationName`, `employeeName`, `categoryName` next to the ids,
  so grouping needs no joins — the label is on the row.
- **Scoping is structural.** Every dataset declares its `locationField`. The
  executor injects `organizationId` and the caller's resolved location list into
  the index range *before* any user filter. A custom metric cannot reach another
  organization or a location outside the caller's scope.

### 5.2 Dataset registry

Declared once, next to `lib/dashboard/registry.ts`. Shape:

```ts
type Dataset = {
  id: DatasetId;
  label: string;                        // Danish
  table: TableName;
  timeField: string;
  locationField: string;
  measures: Measure[];
  dimensions: Dimension[];
  filters: Filter[];
  indexes: IndexDescriptor[];           // which filter/dimension combos are backed
  requiredPermission?: PermissionId;
  sensitive?: boolean;
};
```

### 5.3 The nine datasets

| id            | Table                                  | Measures                                        | Dimensions                                                              | Filters                     | Gate                    |
| ------------- | -------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- | --------------------------- | ----------------------- |
| `waste`       | `wasteRegistrations`                   | registrations, quantity (`defaultQuantity`)      | product, category\*, unit, location, source, registeredBy               | status, source              | —                       |
| `badDelivery` | `badDeliveries`                        | registrations, itemCount                         | location, registeredBy                                                  | status, deductFromStock     | —                       |
| `transfers`   | `transfers` + `transferItems`          | transfers, itemsMoved (`quantity × factor`)      | fromLocation, toLocation, product\*\*, unit\*\*, responsible             | —                           | —                       |
| `staffFood`   | `staffFoodRegistrations`               | registrations, quantity, employees (distinct)    | employee, product, category, location, sessionSource                    | status, sessionSource       | —                       |
| `shifts`      | `scheduledShifts`                      | hours (`endsAt − startsAt`), shifts, employees   | employee, location, roleName                                            | roleName                    | —                       |
| `counts`      | `counts`                               | counts, submitted                                | location, status, periodKey                                             | status                      | —                       |
| `salesDaily`  | `salesDaily`                           | revenue, orders, items                           | location                                                                | —                           | `sales.viewAggregate`   |
| `salesOrders` | `salesOrders`                          | revenue, orders, items                           | location, paymentType, department, clerk, hourOfDay                     | paymentType, department     | `sales.viewDetail`      |
| `salesLines`  | `salesLines`                           | revenue, quantity, lines                         | product, location, clerk                                                | product                     | `sales.viewDetail`      |

\* waste category needs a `products` → `categories` lookup, the only secondary
read in the set. The existing `wasteByCategory` computer already does it.

\*\* transfer product and unit require reading `transferItems` by `transferId`,
as `itemsMoved` already does. `transferItems` has no time or location field of
its own, so the parent `transfers` rows bound the query.

Money is stored in integer minor units; all revenue measures divide by 100 at
the edge, as `salesRevenue` already does.

### 5.4 Guardrails

- **Index-backed or refused.** The builder never offers a filter/dimension
  combination the dataset has no index for.
- **Row cap.** Reuse `MAX_ROWS = 5_000` and the existing `truncated: true` flag,
  which the widget UI already renders.
- **Cardinality cap.** Dimensions return top-N (default 10, max 50); the
  remainder folds into a single "Andre" entry.
- **Location cap.** `MAX_SCOPE_LOCATIONS = 200` applies unchanged.
- **Same output contract.** A custom metric returns the identical `MetricResult`
  as a built-in, so every visualization, the y-axis settings, the share flow and
  the `getMetrics` batching work unchanged.
- **Inherited sensitivity.** A metric over a sales dataset is `sensitive`
  automatically, which keeps the existing "password required on shares
  containing sensitive metrics" rule holding with no new code.
- **Anonymous granularity.** A spec whose dimension is `employee` or `clerk` is
  rejected for roles with `granularity: "anonymous"`, and the dimension is hidden
  in the builder. The existing location anonymisation in `anonymousAliases`
  (`convex/lib/dashboardMetrics.ts:1490`) is untouched; no employee equivalent is
  built.

### 5.5 Ratios

A `ratio` spec holds two `querySpec`s sharing one bucket.

- Both sides are evaluated over the same buckets and the same resolved locations.
- A `dimension` on a ratio must exist on **both** datasets; the builder offers
  only the intersection.
- **Zero denominator blanks the point.** The bucket is omitted from `points`
  rather than emitted as `0`, so a line shows a gap and a bar shows nothing.
  This deliberately differs from the built-in `averageBasket`, which returns 0.
- **Totals divide sums**, never average per-bucket ratios:
  `total = Σnumerator / Σdenominator`. Same for `previousTotal`. This is what
  `headlineTotal` / `headlinePrevious` already exist for in `MetricResult`.
- **Unit derived from the pair:** `count/count` → plain number;
  `currency/count` → currency; `currency/hours` → currency, label suffixed
  "pr. time"; anything over a `quantity` → plain number.
- Valid visualizations: `kpi`, `line`, `bar`, `area`, `gauge`, and `table` or
  `list` when a dimension is set. `donut` is refused — a ratio has no meaningful
  part-to-whole reading.

### 5.6 Authoring and lifecycle

- Gated on `dashboard.manage`.
- Organization-level library, reusable across dashboards. Created inline from
  the add-widget dialog and listed in organization settings.
- Live preview while building, using the current board scope and range.
- **Deletion:** the confirm dialog lists every dashboard and widget referencing
  the metric. Proceeding deletes the metric *and* removes those widgets from
  their dashboards, in one mutation.

### 5.7 Built-ins

All 18 stay in `dashboardMetricComputers`, unchanged. They are curated presets;
the builder is the escape hatch. `countCompliance`, `averageBasket`,
`locationComparison` and `headcountToday` carry logic a generic engine models
badly and must not be reimplemented as specs. The add-widget dialog lists
built-ins and custom metrics together.

---

## 6. OnlinePOS clerk chain

Ordered so the unknown is resolved by looking, not by guessing. §6.1 ships
first and on its own; §6.2 onwards is written against what it shows.

### 6.1 Raw sales response inspector — ships first

Nothing in the API documentation says whether `clerk` is a name, a code, or an
internal id. Rather than designing around the ambiguity, expose the response.

Add a **"Rå salgsrespons"** section to the OnlinePOS integration panel
(`components/organization/online-pos-integration.tsx`):

- A date picker (single day) and a "Hent" button.
- A Convex `action` that calls `/exportSales/v20` for that day using the
  organization's existing stored credentials, and returns the **first 5 raw
  order lines** as unmodified JSON.
- Rendered pretty-printed in a scrollable `<pre>`, with a copy button.
- Nothing is stored. The action reads and returns; it writes no tables.

Constraints:

- Gated on `integrations.manage`, same as the rest of the panel.
- Response is sales data, so it is never logged and never cached.
- Cap at 5 lines and truncate any single string over 500 characters, so a
  surprising payload cannot blow up the page or the function result.
- Errors surface the OnlinePOS status code verbatim; this is a diagnostic tool
  and a raw failure message is more useful than a translated one.

This is independently useful beyond the clerk question: it is the fastest way
to diagnose any future OnlinePOS field or mapping problem.

### 6.2 Capture — after §6.1 has been read

Once the response is understood, switch `requestSales` from `POST /exportSales`
to `/exportSales/v20` and extend `parseSaleLines` to read `clerk` and `pnumber`
alongside the existing `line.{id, chk, product_id, amount, price, department}`.

Store both raw on `salesLines`, per §2.4. If §6.1 shows the fields are named or
shaped differently than the documentation implies, the field names in §2.4
adjust; nothing else in this spec moves.

### 6.3 Dimension — raw, unmapped

The builder exposes a **"Kasserer"** dimension on the `salesOrders` and
`salesLines` datasets, grouping by the raw clerk value with the raw value as its
own label. Rows with no clerk group under "Ukendt kasserer" so totals reconcile.

**There is no clerk-to-employee mapping in this release.** No auto-matching, no
mapping UI, no mapping table. `employees` has no employee number to match on
(`schema.ts:273` — only `firstName`, `lastName`, `displayName`,
`normalizedName`, `imageUrl`, `active`), and until §6.1 tells us whether `clerk`
is even a name, any matching strategy is a guess. Deferred to §11.

The dimension is still person-identifying, so it stays blocked at `anonymous`
granularity exactly like `employee` (§5.3).

### 6.4 Backfill

Clerk capture is forward-only. The OnlinePOS panel gains a manual backfill:
a date range picker, **capped at 90 days per run**, which re-pulls
`/exportSales/v20` for that window and patches `externalClerkId` and
`clerkName` onto existing `salesLines` and `salesOrders`. Progress and last run
surface through `onlinePosSyncStatus`. Older periods are covered by repeating
the run.

### 6.5 Attribution caveat

`clerk` is who took payment, not who sold or prepared. On a split-payment order
different lines carry different clerks. The Danish dimension label is
**"Kasserer"**, never "Medarbejder", and the metric information popover states
the caveat. This holds regardless of whether a mapping is added later.

---

## 7. Sharing

`createShare` takes a `dashboardId` and snapshots that dashboard. The existing
rules are unchanged: name ≤ 100 chars, expiry ≤ 90 days, optional password,
password **mandatory** when the snapshot contains a sensitive metric,
`granularity` and `salesDetailAllowed` frozen at creation.

A snapshot containing a custom metric copies the resolved spec, not the
`customMetrics` id, so deleting the metric cannot break a live link.

`listShares` and `revokeShare` gain a dashboard column and filter.

---

## 8. Terminology

The UI says "Dashboard"; five Convex error strings say "Overblikket".
Standardise on **Dashboard**:

- `convex/dashboard.ts` — replace "Overblikket …" with "Dashboardet …"
  (widget cap, concurrent-edit, period-length messages).
- New strings use "dashboard": "Nyt dashboard", "Dashboardet blev slettet",
  "Du har ikke adgang til dette dashboard".

Sidebar, page title and `share-dialog.tsx` default already say "Dashboard" and
need no change.

---

## 9. Work breakdown

Per `AGENTS.md` § Model use: steps touching auth, permissions or the data model
stay with Opus 5; the rest is delegated to `gpt-5.6-luna` with a review pass
from a stronger model.

| #   | Step                                                                                     | Owner   | Depends on |
| --- | ---------------------------------------------------------------------------------------- | ------- | ---------- |
| 1   | Schema reshape, `dashboard.manage`, widget validator, table reset                          | Opus 5  | —          |
| 2   | Convex dashboard CRUD: list, create, rename, duplicate, delete, reorder, role access       | Opus 5  | 1          |
| 3   | Default resolution + `/dashboard/[dashboardId]` route + URL scope/range state               | luna    | 2          |
| 4   | Tab switcher, `+` tab, drag reorder, settings dialog                                        | luna    | 3          |
| 5   | Per-widget range: picker in the widget menu, per-widget resolution in `getMetrics`          | luna    | 1          |
| 6   | Dataset registry + generic executor, single-metric only, 5 non-sales datasets               | Opus 5  | 1          |
| 7   | Remaining 4 datasets incl. the sales permission gates                                       | luna    | 6          |
| 8   | Ratio specs: executor, unit derivation, zero-denominator handling                            | Opus 5  | 7          |
| 9   | Builder UI: dataset/measure/dimension/filter pickers, live preview, metric library          | luna    | 8          |
| 10  | Custom-metric lifecycle: usage lookup, cascade delete, share snapshotting                    | luna    | 9          |
| 11  | Raw sales response inspector on the OnlinePOS panel (§6.1)                                   | luna    | —          |
| 12  | **Read the output of 11 and confirm what `clerk` contains**                                  | —       | 11         |
| 13  | `/exportSales/v20` switch, clerk fields on `salesLines`, sync changes                         | luna    | 12         |
| 14  | Raw "Kasserer" dimension on the sales datasets                                                | luna    | 13, 7      |
| 15  | Manual backfill action + panel controls                                                       | luna    | 13         |
| 16  | Terminology pass                                                                              | luna    | 2          |

Steps 1 → 2 gate almost everything. 6 and 11 are independent of the dashboard
work and can run in parallel from the start.

Step 12 is a human reading a JSON payload, not an implementation task. It is
listed because everything after it is written against what it shows, and because
the whole clerk chain should stop there if the answer is inconvenient.

### Verification

- `convex/access.test.ts` gains cases for `dashboard.manage`, for a dashboard
  allowed to a role whose members have narrower location scope, and for the
  anonymous-granularity rejection of an employee dimension.
- Every dataset gets one executor test asserting the query is index-backed and
  the row cap engages.
- Ratio: a test asserting `Σnum / Σden` for the total, and that a zero-denominator
  bucket is absent from `points` rather than zero.
- OnlinePOS: extend `convex/onlinePosSync.test.ts` with a v20 payload fixture
  including split-payment lines across two clerks.

---

## 10. Risks

| Risk                                                                                      | Mitigation                                                                                          |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `clerk` turns out to be an opaque code, useless as a label                                 | Resolved by inspection in step 11 before any dependent work starts. If it is opaque, stop after step 12 and the dimension is simply not shipped; §2.4 is the only change already made. |
| A raw clerk label leaks a name to someone who should not see it                             | The dimension is gated behind `sales.viewDetail` and blocked at `anonymous` granularity, exactly like `employee`. |
| The inspector exposes raw sales data on a settings page                                     | Gated on `integrations.manage`, capped at 5 lines, never logged, never cached, never stored.          |
| Generic executor introduces an accidental table scan                                        | The builder cannot express a query the dataset declares no index for. Row cap and `truncated` flag.   |
| Permission regression moving from private to shared boards                                  | Every read path resolves locations and granularity server-side before touching data; new tests in §9. |
| Builder UI becomes usable only by its author                                                | All labels driven by the dataset registry in Danish, live preview, no free-text field names.          |
| Scope: ratios + nine datasets + widget ranges + the OnlinePOS chain is a large v1           | Steps 6–10 and 11–13 are independently shippable; either can be cut to a later release without rework.|

---

## 11. Deferred

**Clerk-to-employee mapping.** Blocked on step 12, not on a decision. Once §6.1
shows what `clerk` contains, revisit: a mapping table, a match strategy (name,
or a new `employeeNumber` on `employees`), and a mapping UI following the
`LocationMappings` component in `workfeed-integration.tsx:266`. Until then the
"Kasserer" dimension stands on its own and is useful without it.

Also not rejected, not scheduled: drill-down from a widget into the underlying rows,
CSV export per widget, targets and thresholds (the `target` field already exists
in `MetricResult` and only `gauge` uses it), a comparison-period selector
(previous period vs same period last year), dashboard templates, scheduled email
digests, and an explicit phone stacking order for the 4-column grid.
