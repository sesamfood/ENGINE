# Implementation plan: closing the McDonald's-model gap

Technical plan for reshaping **already-implemented features** toward the goals in the gap
analysis *"McDonald's-modellen holdt op mod SESAM Engine"* (10 August 2026).

> **Source document.** `docs/mcdonalds-gap.md` is not in the working tree. It exists only in
> the t3 checkpoint commit `90832b3`; read it with
> `git show 90832b3:docs/mcdonalds-gap.md`. This plan is self-contained and does not
> require it.

**Scope of this plan.** Changes to existing features only. The modules the gap analysis
scores at 0 % — Operations (SOD/EOD, tasks, egenkontrol), Quality, Equipment, Franchise —
are **out of scope** except where an existing feature must be reshaped to make room for
them later.

## Decisions already made

These are settled. Do not re-litigate them while implementing.

1. **A franchisee is an `operator` inside the chain's Better Auth organization**, not its own
   organization. Org-per-franchisee makes cross-portfolio aggregation impossible.
2. **Named roles use Better Auth's `dynamicAccessControl`.** Enable it and regenerate the
   component schema. Task 4 contains a documented fallback if it proves unworkable.
3. **KPI formulas stay as TypeScript.** Only their documentation becomes data.
4. **`admin` stops being a code-level bypass.** It keeps every permission by seeding.
5. **Time zone migration is low risk right now.** All existing data is `Europe/Copenhagen`
   and the dataset is small, so the re-rollup is a verifiable no-op today. See task 2.
6. **The offline promise is bounded** to waste, count, and staff-food registration. The
   client-side queue is out of scope; only its server-side prerequisite is in.

## Rules that apply to every task

- All user-facing interface text is **Danish**. This document is English; the UI is not.
- Every organization-owned record is scoped by `organizationId`. Never read or write across
  organizations.
- Permission checks are enforced **server-side** in Convex. Client-side checks and hidden UI
  are usability, not security.
- Read `convex/_generated/ai/guidelines.md` before writing Convex code.
- Use shadcn/ui components; invoke the `shadcn` skill when creating UI.
- Do not add dependencies. Everything here is achievable with the installed stack.
- Keep permission logic centralized in `convex/lib/auth.ts` and `lib/auth-permissions.ts`.
  Never re-implement a check inside a module.

Baseline verification for every task, unless the task says otherwise:

```bash
bun run test      # vitest; 8 tests across convex/access.test.ts and convex/transfers.test.ts
bun run lint
bun run build
```

## Model assignment

Tasks touching auth, permissions, or the data model go to **`gpt-5.6-sol` at high reasoning
effort**. This deviates from the model table in `AGENTS.md`, which reserves sol as a last
resort and assigns those tasks to Opus 5 — the deviation is deliberate and applies to this
plan.

| Task | Model | Reason |
| --- | --- | --- |
| 1 · Location masterdata | `gpt-5.6-sol` (high) | Data model |
| 2 · Time zone per location | `gpt-5.6-luna`, `gpt-5.6-sol` (high) for the re-rollup | Mechanical replacement is delegable; the data rewrite is not |
| 3 · Currency | `gpt-5.6-luna` | Presentation plus one contract field |
| 4 · Named roles | `gpt-5.6-sol` (high) | Auth component + data model |
| 5 · Test net | `gpt-5.6-luna` | Tests against current behaviour |
| 6 · Operator scope, bypass removal | `gpt-5.6-sol` (high) | Security boundary |
| 7 · Granularity | `gpt-5.6-sol` (high) | Permission model |
| 8 · Audit log | `gpt-5.6-luna` | Additive table plus call sites |
| 9 · Data-quality display | `gpt-5.6-luna` | Reads existing status tables |
| 10 · KPI documentation | `gpt-5.6-luna` | Metadata |
| 11 · Drill-down | `gpt-5.6-luna` | Contained in dashboard code |

Every delegated task gets a review pass from a stronger model afterwards. Escalate one step
at a time on failure: luna → terra → sol. Tasks already assigned to sol have nowhere to
escalate to — if sol fails one twice, stop and report rather than retrying.

Invocation, per `AGENTS.md`:

```bash
# Implementation
codex exec -m gpt-5.6-sol -c model_reasoning_effort="high" -s workspace-write "<full task definition>"

# Review of a finished task (read-only)
codex exec -m gpt-5.6-sol -c model_reasoning_effort="high" "<review prompt>"
```

Codex starts with no knowledge of this plan's context. Paste the whole task section — goal,
scope, implementation, constraints, verification — into the prompt.

## Execution order

```
1 ─┬─> 2 ──> 3
   ├─> 11
   └─> 6 ──> 7
4 ──> 6
5 ──> 6
8, 9, 10  (independent, any time)
```

Tasks 8, 9 and 10 have no prerequisites and can run in parallel with anything. Task 5 must
land before task 6. Task 2 should be done early, while it is still a no-op.

---

# Task 1 · Turn `locations` into restaurant masterdata

**Model: `gpt-5.6-sol` (high).** Blocks tasks 2, 3, 6, 7 and 11.

## Goal

`locations` carries market, legal entity, operator, ownership type, concept version,
currency, time zone and lifecycle status. Three new lookup tables exist. Existing location
rows remain valid with every new field unset, and the locations page can edit the new fields.

## Scope

- `convex/schema.ts` — extend `locations` (currently line 593); add `markets`,
  `legalEntities`, `operators`.
- `convex/locations.ts` — extend queries and mutations; add `updateLocation`.
- New `convex/masterData.ts` — CRUD for the three lookup tables.
- `app/organization/locations/` and a new location detail form.
- New `components/organization/location-details.tsx`.

Out of scope: `franchiseAgreementId` (points at a table that does not exist yet — add it with
the franchise module), and any use of the new fields by dashboards (that is task 11).

## Implementation

Add three lookup tables. Copy the shape of the existing `categories` / `units` tables
exactly — same `normalizedName` convention, same index naming:

```ts
markets: defineTable({
  organizationId: v.string(),
  name: v.string(),
  normalizedName: v.string(),
  currency: v.optional(v.string()),   // ISO 4217, default for locations in this market
  timeZone: v.optional(v.string()),   // IANA, default for locations in this market
}).index("by_organizationId_and_normalizedName", ["organizationId", "normalizedName"]),

legalEntities: defineTable({
  organizationId: v.string(),
  name: v.string(),
  normalizedName: v.string(),
  registrationNumber: v.optional(v.string()),
}).index("by_organizationId_and_normalizedName", ["organizationId", "normalizedName"]),

operators: defineTable({
  organizationId: v.string(),
  name: v.string(),
  normalizedName: v.string(),
  legalEntityId: v.optional(v.id("legalEntities")),
  contactEmail: v.optional(v.string()),
  status: v.union(v.literal("active"), v.literal("inactive")),
}).index("by_organizationId_and_normalizedName", ["organizationId", "normalizedName"])
  .index("by_organizationId_and_status", ["organizationId", "status"]),
```

Then extend `locations`. **Every new field is optional** so no backfill is needed:

```ts
locations: defineTable({
  organizationId: v.string(),
  name: v.string(),
  normalizedName: v.string(),
  countProductOrder: v.optional(v.array(v.id("products"))),
  openingHoursMode: v.optional(openingHoursModeValidator),
  weeklyOpeningHours: v.optional(v.array(weeklyOpeningHoursValidator)),
  // masterdata
  marketId: v.optional(v.id("markets")),
  legalEntityId: v.optional(v.id("legalEntities")),
  operatorId: v.optional(v.id("operators")),
  ownershipType: v.optional(v.union(
    v.literal("owned"),
    v.literal("franchise"),
    v.literal("jointVenture"),
    v.literal("license"),
  )),
  conceptVersion: v.optional(v.string()),
  openedAt: v.optional(v.number()),
  currency: v.optional(v.string()),   // ISO 4217
  timeZone: v.optional(v.string()),   // IANA, overrides market and organization
  status: v.optional(v.union(
    v.literal("planned"),
    v.literal("open"),
    v.literal("temporarilyClosed"),
    v.literal("closed"),
  )),
})
  .index("by_organizationId_and_normalizedName", ["organizationId", "normalizedName"])
  .index("by_organizationId_and_status", ["organizationId", "status"])
  .index("by_organizationId_and_operatorId", ["organizationId", "operatorId"])
  .index("by_organizationId_and_marketId", ["organizationId", "marketId"]),
```

Add the three new indexes **now** even though nothing reads them yet. Tasks 6 and 11 need
them, and adding an index later is free while rewriting the queries that should have used it
is not.

Add `updateLocation` to `convex/locations.ts`, guarded by `requireLocationManager` like the
existing `renameLocation` at line 409. Validate that every referenced `marketId`,
`legalEntityId` and `operatorId` belongs to the caller's organization — follow the existing
pattern in `setMemberLocationAccess` (`convex/access.ts:328-333`), which loads each
referenced document and compares `organizationId`.

Validate `currency` as a 3-letter uppercase ISO 4217 code and `timeZone` with the
`requireTimeZone` helper that already exists at `convex/employees.ts:85` — move it to a
shared module rather than duplicating it.

`ownershipType` left unset means the organization's own entity. Do not write a default value
into the row; resolve it at read time.

Deleting an operator, market or legal entity that a location still references must fail with
a Danish error rather than orphaning the reference.

## Constraints

- Do not make any new field required. Existing rows must stay valid without a migration.
- Do not change existing `locations` fields or the `by_organizationId_and_normalizedName`
  index — 19 tables carry `locationId` and many queries depend on that index.
- `deleteLocation` (`convex/locations.ts:438`) and its batched sales cleanup must keep
  working unchanged.
- Do not hardcode any company name, market, currency or location.

## Verification

- Existing locations load and list with every new field unset.
- A location can be assigned market, legal entity, operator, ownership type, concept version,
  currency, time zone and status, and all of it round-trips.
- Referencing another organization's market or operator throws.
- Deleting a referenced operator throws with a Danish message.
- `bun run test && bun run lint && bun run build`.

---

# Task 2 · Move time zone resolution to the location

**Model: `gpt-5.6-luna` for the resolver; `gpt-5.6-sol` (high) for the re-rollup.** Depends on
task 1.

## Goal

Time zone resolves per location with fallback to market, then organization, then
`Europe/Copenhagen`. Changing a location's time zone triggers a batched, restartable
re-rollup of `salesOrders.dayStart` and `salesDaily`.

## Why now

`salesOrders.dayStart` is frozen at ingest in the organization time zone — the comment at
`convex/schema.ts:129-131` already flags this. The cost of fixing it scales with row count.
**Right now every row is `Europe/Copenhagen` and the dataset is small, so the re-rollup is an
idempotent no-op.** That is the ideal moment to write and verify it: run it against real data
and assert it changes zero rows. Correctness gets proven before it ever matters.

## Scope

- New `convex/lib/timeZone.ts`.
- Replace direct reads of `organizationScheduleSettings.timeZone` in: `convex/employees.ts`
  (lines 183, 237), `convex/staffFood.ts` (line 105), `convex/sales.ts` (line 159),
  `convex/badDeliveries.ts` (line 1036), `convex/onlinePosSync.ts` (line 191).
- New internal mutation `convex/onlinePosSync.ts` → `rerollLocationDayStarts`.
- `convex/locations.ts` → `updateLocation` schedules it.
- Remove the stale comment at `convex/schema.ts:129-131`.

Out of scope: changing how `salesDaily` is written during normal sync.

## Implementation

The resolver:

```ts
// convex/lib/timeZone.ts
export const DEFAULT_TIME_ZONE = "Europe/Copenhagen";

export async function resolveTimeZone(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  locationId?: Id<"locations">,
): Promise<string> {
  // location → market → organization → default
}
```

Keep `organizationScheduleSettings` as the organization-level default. It is not being
removed, only demoted to one step in a chain.

`convex/onlinePosSync.ts:191` is the important call site — it decides `dayStart` at ingest via
`dayStartOf` (`convex/lib/salesRollup.ts:28`). Every other call site is display-only.

For the re-rollup, **copy the self-rescheduling batch pattern from `cleanupLocationSales` at
`convex/locations.ts:674`**. It is the established idiom in this codebase: `.take(BATCH)`,
process, reschedule via `ctx.scheduler.runAfter(0, ...)` if the batch was full, and guard
against running under the wrong preconditions.

```ts
export const rerollLocationDayStarts = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    timeZone: v.string(),
    cursor: v.optional(v.string()),
  },
  // 1. Recompute dayStart = dayStartOf(occurredAt, timeZone) for a batch of salesOrders.
  // 2. Patch only rows where it actually changed.
  // 3. Reschedule while more remain.
  // 4. On the final batch, rebuild salesDaily for the location from salesOrders.
});
```

Rebuild `salesDaily` by deleting the location's rows and re-aggregating from `salesOrders`,
rather than patching in place. Full rebuild is simpler and the dataset is small. Reuse
`dayBucketKey` (`convex/lib/salesRollup.ts:41`) for grouping.

Guard against concurrent runs the same way the sync path already does with
`pendingReconcileDayStart` (`convex/schema.ts:106`). A half-finished re-rollup that gets
restarted must converge, not corrupt.

Only schedule the re-rollup when the effective time zone actually changed. Setting a
location's time zone to the value it already resolved to must not trigger work.

## Constraints

- `salesOrders.revenue` stays integer minor units. Do not touch money during this task.
- The re-rollup must be restartable and idempotent. Running it twice produces the same result.
- Do not block `updateLocation` on the re-rollup — schedule it and return.
- Sales reads must not call a provider API. This is a pure database operation.

## Verification

- **Run `rerollLocationDayStarts` against current production-shaped data and assert it patches
  zero rows.** All data is already `Europe/Copenhagen`; any change means the resolver
  disagrees with the ingest path, which is a bug.
- Change a location to `America/New_York`, let the re-rollup finish, and confirm `salesDaily`
  totals still sum to the same revenue as `salesOrders` for that location — the day
  boundaries move, the totals do not.
- Restarting the mutation mid-run converges to the same result.
- Note: `bun run check:sales` exercises the pure delta arithmetic in
  `convex/lib/salesRollup.ts` only. It does **not** verify live data, so it is necessary but
  not sufficient here. Write a throwaway internal query that recomputes `salesDaily` from
  `salesOrders` and compares.

---

# Task 3 · Make money currency-aware

**Model: `gpt-5.6-luna`.** Depends on task 1.

## Goal

Currency travels with every monetary value. A scope spanning multiple currencies refuses to
show a single summed total instead of silently adding DKK to EUR.

## Scope

- `convex/lib/dashboardValidators.ts` — `metricResultValidator` (line 83).
- `lib/dashboard/types.ts` — the `MetricResult` type.
- `convex/lib/dashboardMetrics.ts` — the three currency metrics: `salesRevenue`,
  `averageBasket` (line 678 area), and `salesOrderCount`'s siblings.
- `components/dashboard/visualizations/utils.ts` (lines 18-22).
- `components/organization/online-pos-integration.tsx` (lines 99-101, 165).
- `docs/dashboard-widgets.md`.

## Implementation

Storage does not change. Integer minor units is correct; what is missing is the code
travelling alongside the number.

Add to `MetricResult`:

```ts
currency?: string;          // ISO 4217, present when unit === "currency"
mixedCurrency?: boolean;    // true when the scope spans more than one currency
```

The `mixedCurrency` flag is the point of this task. When it is true, currency widgets must
render a Danish "flere valutaer" state instead of a total. Showing a wrong number is worse
than showing no number — a single figure that adds DKK to EUR is indistinguishable from a
correct one.

Per-currency breakdown is acceptable and preferable where the visualization supports it.

Replace the hardcoded `"DKK"` in both formatters with the currency from the result, falling
back to the organization default. Keep `da-DK` as the locale — that is interface language,
not currency.

## Constraints

- Do not change how money is stored.
- Do not add a currency-conversion dependency or exchange rates. Out of scope entirely.
- Existing saved dashboards must keep working; both new fields are optional.

## Verification

- Two locations with different currencies in one aggregate scope render the mixed-currency
  state, not a number.
- A single-currency scope renders identically to today.
- A location with no currency set falls back to the organization default.

---

# Task 4 · Named, organization-defined roles

**Model: `gpt-5.6-sol` (high).** Blocks task 6. Touches the auth component.

## Goal

An organization can define its own roles beyond `admin` / `manager` / `member`. The three
existing roles become seeded system roles. Members can be invited into and assigned to custom
roles.

## Why before the franchise module

`rolePermissions.role` is a three-literal union (`convex/schema.ts:18-22`). Once a franchise
portfolio references role assignments, migrating them is expensive. The gap analysis assumes
eight role archetypes; the current model supports three.

## Verified Better Auth behaviour

Checked against the installed `better-auth@1.6.15`:

- `updateMemberRole` does **not** validate the role string against declared roles
  (`node_modules/better-auth/dist/plugins/organization/routes/crud-members.mjs:238-265`).
  Assigning a custom role to an existing member works with no Better Auth change.
- `createInvitation` **does** validate
  (`.../routes/crud-invites.mjs:100-121`). It rejects any role outside
  `defaults ∪ orgOptions.roles` unless `dynamicAccessControl.enabled` is true **and** the role
  exists in the `organizationRole` table.
- `dynamicAccessControl` is supported (`.../organization/types.d.mts:66`) and exposes
  `organization/create-role`, `list-roles`, `get-role`, `update-role`, `delete-role`.
- The `organizationRole` table is `{ id, organizationId, role, permission: Record<string,
  string[]>, createdAt, updatedAt }`.
- The Convex Better Auth adapter supports the `in` operator that the invite path uses
  (`node_modules/@convex-dev/better-auth/dist/client/adapter-utils.js:215`).

## Scope

- `convex/auth.ts` — enable `dynamicAccessControl` on the `organization({...})` plugin
  (line 308).
- `convex/betterAuth/generatedSchema.ts` — regenerate.
- `convex/betterAuth/schema.ts` — add an index on the new table if needed.
- `convex/schema.ts` — `rolePermissions.role` union → string; add a `roles` table.
- `lib/auth-permissions.ts` — `OrganizationRole` stops being a closed union.
- `convex/access.ts` — `roleValidator` (line 8), `listRolePermissions` (the `.take(3)` at
  line 222 and the literal role array at line 224), `saveRolePermissions`.
- `components/organization/role-permissions.tsx`, `components/organization/member-management.tsx`.

## Implementation

**Start with a spike.** Before touching anything else:

```bash
cd convex/betterAuth
npx auth generate --output generatedSchema.ts
```

The command is documented in that file's own header. Enable `dynamicAccessControl: { enabled:
true }` in `convex/auth.ts` first so the generator emits the `organizationRole` table, then
diff `generatedSchema.ts`. Expect a new table and nothing else to change. **If existing tables
change shape, stop and report before proceeding** — that would affect live auth data.

`convex/betterAuth/schema.ts` spreads `tables` and layers custom indexes on top. If the invite
path needs an index on `organizationRole` by `(organizationId, role)`, add it there, following
the existing `member` index pattern.

**Critical design point: Better Auth's `permission` field is not our permission model.**
Better Auth stores `Record<resource, action[]>` in its own access-control vocabulary. Our 22
permission ids (`waste.report`, `dashboard.viewSales`, …) live in Convex `rolePermissions`.
Do not try to unify them.

Use `organizationRole` **only to register the role name** so invitations validate, writing a
minimal manager-equivalent permission blob into it. Convex `rolePermissions` remains the sole
source of truth for what a role may actually do. This is the design the code already
documents at `lib/auth-permissions.ts:6-8` — extend it, do not replace it.

Schema changes:

```ts
roles: defineTable({
  organizationId: v.string(),
  key: v.string(),              // stable identifier, also written to Better Auth
  name: v.string(),             // Danish display name
  isSystem: v.boolean(),        // true for admin/manager/member
  updatedAt: v.number(),
}).index("by_organizationId_and_key", ["organizationId", "key"]),
```

`rolePermissions.role` becomes `v.string()`. **This widening needs no migration** — Convex
accepts it because `v.string()` admits the existing three literals. Rename the field to
`roleKey` only if you are willing to write a migration; otherwise leave the name alone.

Seed `admin`, `manager`, `member` as `isSystem: true` on first access, defaulting their
permissions from `defaultRolePermissions` in `lib/auth-permissions.ts:99`.

`saveRolePermissions` currently rejects editing `admin` outright (`convex/access.ts:242`).
Replace that with an invariant: **at least one role in the organization must retain
`roles.manage` and `members.manage`**. That is the property actually worth protecting, and it
allows a franchise-scoped admin role to exist. Mirror the existing last-admin guard at
`components/organization/member-management.tsx:507` server-side.

Deleting a role that members still hold must fail with a Danish error.

## Fallback

If the regeneration turns out to be unworkable, fall back to: keep `orgOptions.roles` static,
always invite as `member`, and set the custom role immediately after acceptance via
`updateMemberRole` — which does not validate. This ships with no auth-component change at all.
Everything else in this task stays the same. Record which path was taken in this file.

## Constraints

- Convex `rolePermissions` stays the authority on permissions. Better Auth's `permission`
  field is registration metadata only.
- Do not break existing sessions or memberships. `admin` / `manager` / `member` keep working
  with their current names.
- Role display names are Danish; role keys are stable ASCII identifiers.

## Verification

- Diff `generatedSchema.ts` and confirm only `organizationRole` was added.
- Existing members keep their roles and permissions across the change.
- A custom role can be created, given permissions, assigned, and enforced server-side.
- A user can be **invited directly into** a custom role (this is what dynamic AC buys).
- The last role holding `roles.manage` cannot have it removed.
- `convex/access.test.ts` extended and passing.

---

# Task 5 · Build the test net before changing the security boundary

**Model: `gpt-5.6-luna`.** Blocks task 6.

## Goal

Location-scoping and permission behaviour is covered by tests **that assert today's
behaviour**, so task 6 can change it deliberately rather than accidentally.

## Why

The suite is 8 tests across 2 files and runs in under a second. Task 6 changes a security
boundary across 193 `require*` call sites. There is currently almost no regression coverage
underneath it.

## Scope

- Extend `convex/access.test.ts`.
- New `convex/lib/auth.test.ts`.
- `convex-test@0.0.54` is already installed. Follow the existing patterns in
  `convex/access.test.ts` and `convex/transfers.test.ts`.

## Implementation

Cover, against current behaviour:

- `resolveLocationFilter` (`convex/lib/auth.ts:156`) for all three cases: explicit
  `locationId`, kiosk account, `all` scope, and `selected` scope.
- `requireLocationAccess` (line 144) rejecting an out-of-scope location and rejecting a kiosk
  account reaching a different location.
- `hasPermission` (`lib/auth-permissions.ts:126`) — including, explicitly, that `admin`
  currently bypasses the permission set. **Write this test asserting the bypass exists.**
  Task 6 will invert it; that inversion should be a visible, deliberate diff.
- `requirePermission` throwing for a member lacking the permission.
- At least one end-to-end scoping test per major module (waste, count, transfers) proving a
  `selected`-scope member cannot read another location's rows.

## Constraints

- Assert current behaviour, do not fix anything. Bugs found here get reported, not patched.
- No changes to non-test files.

## Verification

- New tests pass against unmodified source.
- Each new test fails if the corresponding guard in `convex/lib/auth.ts` is commented out.
  A test that passes with the guard removed is not testing anything.

---

# Task 6 · Operator scope, and removing the admin bypass

**Model: `gpt-5.6-sol` (high).** Depends on tasks 1, 4 and 5. Security boundary.

## Goal

Access scope supports an operator level above location. `admin` derives its rights from its
permission set rather than from a code-level short-circuit.

## Scope

- `lib/auth-permissions.ts:131` — the `if (role === "admin") return true;` bypass.
- `convex/access.ts:116` and `:155` — the two server-side mirrors.
- `convex/lib/auth.ts:72` — the third mirror, and `resolveLocationFilter` at line 156.
- `convex/schema.ts` — `memberLocationAccess.scope` gains `"operator"`.
- `convex/access.ts` — `setMemberLocationAccess`, `listMemberLocationAccess`.
- `components/organization/member-management.tsx`.
- **Audit all 18 direct `requireOrganization` callers.**

## Implementation

Removing the bypass is close to behaviour-preserving: `defaultRolePermissions.admin` is
already `permissionIds` (`lib/auth-permissions.ts:100`), so an admin whose permissions come
from data has exactly the same rights. What changes is that the rights become inspectable and
revocable. Delete the bypass in all four places, and stop overriding the stored permission set
with `defaultRolePermissions.admin` at `convex/access.ts:116`, `:155` and `convex/lib/auth.ts:72`.

Rely on the invariant from task 4 — at least one role keeps `roles.manage` and
`members.manage` — to prevent lockout.

Then add operator scope:

```ts
memberLocationAccess: defineTable({
  organizationId: v.string(),
  userId: v.string(),
  scope: v.union(v.literal("all"), v.literal("selected"), v.literal("operator")),
  locationIds: v.array(v.id("locations")),
  operatorId: v.optional(v.id("operators")),
  updatedAt: v.number(),
})
```

Resolve `"operator"` inside `resolveLocationFilter` (`convex/lib/auth.ts:156`) by querying
locations on the `by_organizationId_and_operatorId` index added in task 1. **Every module
already routing through `resolveLocationFilter` inherits operator scoping for free.** That is
why this change is containable.

The risk is entirely in the exceptions. Audit each of the 18 direct `requireOrganization`
callers:

```bash
grep -rn "requireOrganization(" convex --include="*.ts" | grep -v _generated | grep -v "lib/auth.ts"
```

For each, determine whether it reads location-scoped data. If it does and it does not go
through `resolveLocationFilter`, it is a potential cross-operator leak. Fix by routing it
through the helper. Do not add ad-hoc operator checks inside modules — that is exactly the
per-module duplication the architecture rules forbid.

An `"operator"`-scoped member whose operator has no locations gets an empty result, not an
error and not everything.

## Constraints

- The organization boundary remains absolute. Operator scope narrows within an organization;
  it never widens across one.
- All scope resolution stays in `convex/lib/auth.ts`. No module implements its own.
- Do not change the 193 `require*` call sites. If a change is needed at a call site, the
  helper is wrong.

## Verification

- The task-5 test asserting the admin bypass now fails, and is deliberately inverted.
- An operator-scoped member gets exactly that operator's locations from every list query.
- A test per location-scoped module proving no query returns a location outside the caller's
  operator.
- Every one of the 18 direct callers is individually accounted for — list them and their
  disposition in the PR description.
- Existing `all` and `selected` scopes behave identically to before.

---

# Task 7 · Granularity as a fourth access dimension

**Model: `gpt-5.6-sol` (high).** Depends on task 6.

## Goal

A role can be restricted to aggregate or anonymised data. A franchisee sees their own numbers
in detail, the anonymised median across the chain, and no other operator's identifiable
figures.

## Scope

- `lib/auth-permissions.ts` — role granularity config; extend `permissionCatalog` (line 25).
- `convex/lib/auth.ts:84` — add `granularity` to `OrganizationAuth`.
- `convex/lib/dashboardMetrics.ts` — apply it in breakdown-producing metrics.
- `components/organization/role-permissions.tsx`.

## Implementation

Add to the role config and carry on `OrganizationAuth`:

```ts
granularity: "detail" | "aggregate" | "anonymous";
```

- `detail` — current behaviour, real names everywhere.
- `aggregate` — totals only; breakdowns by location are suppressed.
- `anonymous` — breakdowns are returned with stable pseudonyms ("Restaurant A", "Restaurant
  B") for locations outside the caller's own scope, real names inside it.

Apply this **server-side in the metric computers**, not in the UI. The pseudonym must be
stable within a session but must not be derivable back to a location id by the client. Never
send the real name and let the client hide it.

Also split action from domain in `permissionCatalog`. Today only `waste.export` treats export
as a distinct action. Add `count.export`, `transfers.export`, `dashboard.export`, and separate
`sales.viewDetail` from `sales.viewAggregate`. Approve and close verbs wait for the modules
that need them.

New permissions must be added to `defaultRolePermissions` for all three seeded roles, or
existing users silently lose capability.

## Constraints

- Enforce server-side. A client-side filter is not a granularity control.
- Adding permission ids must not remove capability from existing roles.

## Verification

- An `anonymous`-granularity role receives no other location's name anywhere in the **API
  response**, verified by inspecting the payload rather than the rendered UI.
- An `aggregate` role receives totals with no per-location breakdown.
- A `detail` role sees exactly what it sees today.
- Existing roles keep every capability after the catalog expands.

---

# Task 8 · `auditLog` as one append-only trail

**Model: `gpt-5.6-luna`.** No prerequisites.

## Goal

One shared, append-only audit trail covering permission changes, manual overrides and voids.
Manual overrides carry a mandatory reason.

## Scope

- `convex/schema.ts` — new `auditLog` table.
- New `convex/lib/audit.ts` — a single `recordAudit` helper.
- Call sites: waste void, bad-delivery void, staff-food void, `saveRolePermissions`
  (`convex/access.ts:234`), `setMemberLocationAccess` (line 307), catalog mutations,
  integration connect/disconnect, count reconciliation.
- `convex/crons.ts` — retention.

## Implementation

```ts
auditLog: defineTable({
  organizationId: v.string(),
  locationId: v.optional(v.id("locations")),
  actorUserId: v.string(),
  actorName: v.string(),
  action: v.string(),          // e.g. "waste.void", "roles.permissionsChanged"
  entityTable: v.string(),
  entityId: v.string(),
  summary: v.string(),         // Danish, human-readable
  reason: v.optional(v.string()),
  at: v.number(),
})
  .index("by_organizationId_and_at", ["organizationId", "at"])
  .index("by_organizationId_and_entityTable_and_entityId", [
    "organizationId", "entityTable", "entityId",
  ]),
```

The existing per-module `voidedBy` / `voidedAt` fields (`convex/schema.ts:386`, `:697`,
`:756`) **stay**. The audit log is additive. Do not migrate or remove them.

`requireOrganization` already returns `userName` (`convex/lib/auth.ts:80`) — use it rather
than re-deriving the actor.

**Make `reason` required at the call site for manual overrides** — every void and every count
reconciliation adjustment. A nullable reason produces empty reasons in practice, which fails
the whole purpose. This means adding a required Danish reason field to those confirmation
dialogs.

Never update or delete an audit row outside the retention cron. Append only.

Add retention alongside the existing cleanup jobs in `convex/crons.ts`.

## Constraints

- No mutation may fail because audit writing failed in a way that loses the primary write —
  but the audit write is in the same transaction, so a genuine failure should roll back both.
- Summaries are Danish.
- Do not log secrets. Integration tokens must never reach `summary`.

## Verification

- Every void and every permission change produces exactly one row with a non-empty reason.
- A void cannot be submitted without a reason, enforced server-side.
- Audit rows survive deletion of the entity they describe.
- No integration token appears anywhere in the table.

---

# Task 9 · Show data quality at the number

**Model: `gpt-5.6-luna`.** No prerequisites.

## Goal

Any figure derived from an integration displays its freshness and error state. A revenue
number no longer looks identical whether the integration succeeded this morning or failed
three days ago.

## Scope

- `lib/dashboard/registry.ts` — add `source` to `MetricDefinition` (line 9).
- `convex/lib/dashboardValidators.ts:83` — add `freshness` to `metricResultValidator`.
- `lib/dashboard/types.ts`.
- `convex/lib/dashboardMetrics.ts` — populate it.
- `components/dashboard/widget-card.tsx` — render it.
- `components/dashboard/shared-dashboard.tsx` — shared dashboards need it too.

## Implementation

The status data already exists and is well maintained — `onlinePosSyncStatus`
(`convex/schema.ts:92`) and `workfeedSyncStatus` (line 476) both carry `lastSuccessAt` and
`lastError`. It is simply trapped in `components/organization/online-pos-integration.tsx`.
This task moves it to where the numbers are.

Add to `MetricDefinition`:

```ts
source: "internal" | "onlinepos" | "workfeed";
```

`salesRevenue`, `salesOrderCount` and `averageBasket` are `onlinepos`. `scheduledHours` and
`headcountToday` are `workfeed`. Everything else is `internal`.

Add to `MetricResult`:

```ts
freshness?: {
  lastSuccessAt: number | null;
  staleLocationCount: number;
  errorLocationCount: number;
};
```

Compute it from the sync-status rows for the locations in scope. `internal`-source metrics
return `undefined` and render nothing — no badge at all, not a green one. Only integration
data can be stale.

Render as a small badge on the widget with a Danish tooltip naming affected locations. Respect
task 7's granularity: an anonymised role must not learn location names through the freshness
tooltip. If granularity is not `detail`, show counts only.

Shared dashboards render the badge too. An external recipient has the least context and needs
it most.

## Constraints

- Reads must not call a provider API. Read the status tables only.
- Do not add a new query round-trip per widget; fold freshness into the existing
  `getMetrics` path (`convex/dashboard.ts:300`).
- `lastError` may contain provider text — do not render it raw to non-admins.

## Verification

- Disabling an OnlinePOS location integration marks every sales widget stale within one sync
  interval.
- Internal metrics show no freshness indicator at all.
- Shared dashboards show it.
- An anonymised-granularity role sees counts but no location names in the tooltip.
- No additional Convex query per widget.

---

# Task 10 · Document each KPI's formula and source

**Model: `gpt-5.6-luna`.** No prerequisites.

## Goal

Every metric carries a written formula and its source tables, visible in the UI. HQ can
defend a number to a franchisee.

## Scope

- `lib/dashboard/registry.ts` — extend `MetricDefinition` (line 9) and all 18 definitions.
- `components/dashboard/widget-card.tsx` — info popover.
- `components/dashboard/add-widget-dialog.tsx`.
- `docs/dashboard-widgets.md`.
- `CLAUDE.md` — the "Dashboard widgets" section.

## Implementation

```ts
formula: string;                     // Danish, e.g. "Omsætning ÷ antal ordrer"
sourceTables: readonly string[];     // e.g. ["salesDaily"]
```

Fill in all 18 by reading the actual implementations in
`convex/lib/dashboardMetrics.ts` (711 lines). **Derive each formula from the code, not from
the metric's existing `description` field** — the description is marketing copy and may not
match what the computer does. Where they disagree, the code wins and the discrepancy is worth
reporting.

The formulas stay as TypeScript. Only their documentation becomes data.

Update step 1 of the "Dashboard widgets" instructions in `CLAUDE.md` to require `formula` and
`sourceTables`, otherwise the next metric added will be undocumented again.

## Constraints

- Do not change any metric's computation. This task is documentation only. If a formula looks
  wrong, report it — do not fix it here.
- Formulas and labels are Danish.

## Verification

- A type-level exhaustiveness check that every `MetricId` has a non-empty `formula` and at
  least one `sourceTable`. This must be a compile error, not a runtime check.
- Formula and source visible in both the widget popover and the add-widget dialog.
- No change to any metric's returned values — verify a before/after snapshot of `getMetrics`.

---

# Task 11 · Drill-down above location

**Model: `gpt-5.6-luna`.** Depends on task 1.

## Goal

Dashboard scope supports organization → market → operator → location. Saved dashboards from
before the change keep working.

## Scope

- `convex/lib/dashboardValidators.ts:52` — `scopeValidator`.
- `components/dashboard/scope-selector.tsx`.
- `convex/lib/dashboardMetrics.ts` — the `locationComparison` metric.
- `convex/dashboard.ts` — scope resolution in `getMetrics` (line 300).

## Implementation

```ts
export const scopeValidator = v.object({
  mode: v.union(v.literal("aggregate"), v.literal("compare")),
  locationIds: v.union(v.array(v.id("locations")), v.null()),
  level: v.optional(v.union(
    v.literal("organization"),
    v.literal("market"),
    v.literal("operator"),
    v.literal("location"),
  )),
  parentId: v.optional(v.string()),
});
```

Both new fields are optional and absent means today's behaviour, so existing saved dashboards
in the `dashboards` table (`convex/schema.ts:1104`) and existing shares
(`dashboardShares`, line 1116) stay valid without migration.

Resolve a non-location level to its set of location ids at query time, then feed the existing
metric machinery — which already takes `locations: DashboardLocation[]` in
`DashboardMetricParams` (`convex/lib/dashboardMetrics.ts:14`). The metric computers should not
need to know what level produced their location list.

Generalize `locationComparison` into a comparison across the selected level. That single
metric becomes the benchmark view the gap analysis asks for.

Scope resolution must intersect with the caller's own access scope from task 6. Selecting a
market must never widen access beyond what `resolveLocationFilter` permits. **The scope
selector is a filter, not a grant.**

Respect `MAX_SCOPE_LOCATIONS` (currently 200, `convex/lib/dashboardMetrics.ts:8`) after
expanding a level to locations.

## Constraints

- Existing dashboards and shares must load unchanged.
- Level selection never widens access.
- Danish labels throughout the selector.

## Verification

- Dashboards saved before the change load and render identically.
- Drilling organization → market → operator → location narrows every widget consistently.
- An operator-scoped member selecting "organization" level sees only their own operator's
  data.
- A market with more than 200 locations degrades gracefully via the existing `truncated` flag.

---

# Deliberately out of scope

| Item | Why |
| --- | --- |
| Offline queue (client side) | Bounded to waste, count and staff food. Needs `clientRequestId` idempotency keys on those three mutations first — that server-side prerequisite may land with task 8; the client queue is a separate project. |
| `alerts` table | An alert without owner, deadline and close reason is noise. That makes it a new module, not a change to an existing feature. |
| Operations (SOD/EOD, tasks, egenkontrol, temperatures) | New module. |
| Quality, Equipment, Franchise agreements and royalty | New modules. Franchise depends on tasks 1, 4 and 6. |
| Microservices, event gateway, data warehouse, edge compute, ML platform | Convex is the data core. Copy the layering and the discipline, not the scale. |
| Currency conversion and exchange rates | Explicitly excluded from task 3. |

# Notes for whoever implements this

- **Task 2 is the one with a deadline.** It is a no-op today because all data is
  `Europe/Copenhagen` and the dataset is small. Both of those facts have expiry dates.
- **Task 5 is not optional before task 6.** Changing a security boundary across 193 call
  sites with 8 tests underneath is how cross-tenant leaks happen.
- **Task 4 begins with a spike.** Regenerate, diff, and stop if anything other than
  `organizationRole` changed. The fallback path is documented and ships without touching the
  auth component.
- Tasks 8, 9 and 10 are the cheapest visible improvement to what already ships and have no
  prerequisites. Start one of them in parallel on day one.
