# Implementation plan: own-check review fixes

Technical remediation plan for the findings raised against
`docs/own-checks-implementation-plan.md`.

The existing architecture remains in place:

- pending occurrences stay derived;
- template versions stay append-only;
- submitted entries stay immutable outside `appendRevision`;
- compliance stays server-authoritative;
- organization and location authorization remains enforced in Convex;
- `pdf-lib` remains the only direct dependency added by the module.

This plan fixes correctness, query scalability, audit attribution, export completeness, and
the missing administration details. It does not redesign the module.

## Priorities

Merge blockers:

1. Never generate a PDF or CSV from truncated data.
2. Remove wall-clock reads from Convex queries.
3. Make the overview bounded and correct for multi-location organizations.
4. Preserve deviation and corrective-action attribution during edits.
5. Keep template field keys stable through label changes.

Required follow-ups in the same branch:

6. Fix backlog truncation and user-facing cap errors.
7. Use location time zones in the UI.
8. Centralize settings defaults and fix the active-template cap.
9. Finish version history and the smaller plan deviations.
10. Add the missing regression coverage.

## Decision required: amendments after approval

The current implementation rejects edits and corrective-action changes after approval.
Changing that behavior would implicitly undo an approval because `editOwnCheck` recomputes the
record status and clears approval metadata.

Keep the current prohibition until the product owner chooses one of these policies:

- **Recommended for this remediation:** approved records are closed. A correction requires a
  separately designed superseding-record flow. Update the original plan to state this rule and
  keep the current Danish error.
- **Alternative:** an amendment creates a revision, clears the approval, and requires a new
  approval. This needs an explicit revision kind such as `approvalInvalidated`, a visible audit
  change, and updated UI text. Do not implement it as an ordinary edit.

This decision does not block the other tasks.

## Execution order

```text
1 Export completeness ───────────────┐
2 Deterministic time and time zones ─┼─> 4 Overview query rewrite
3 Shared server guardrails ──────────┘

5 Audit attribution ──> 6 Stable field keys and version history

7 Remaining plan gaps ──> 8 Regression coverage ──> final verification
```

---

# Task 1 · Refuse incomplete documentation exports

## Goal

PDF, CSV, and the on-screen inspection report are generated only when all completed and
missing checks in the requested range have been loaded.

## Scope

- `convex/ownCheckDocumentation.ts`
- `components/own-checks/inspection-documentation.tsx`
- `components/own-checks/inspection-report.tsx`

## Implementation

1. Replace the separate header and missing-check reads with a one-shot
   `prepareDocumentation` mutation. It uses server `Date.now()`, returns the identifying
   header plus `{ items, truncated }`, and performs the same exporter and location-access
   checks as the existing queries.
2. Keep missing-check expansion bounded at `MAX_MISSING` inside that mutation.
3. When the entry set needed to subtract completed occurrences exceeds the cap, return
   `truncated: true`. It is acceptable for `items` to be empty in this case because the client
   must refuse the report; do not present an empty list as complete.
4. Replace `reportReady` with a condition that requires all of:
   - completed-entry pagination is exhausted;
   - completed entries did not exceed `MAX_EXPORT_RECORDS`;
   - prepared documentation context exists for the current range and location;
   - `prepared.missing.truncated === false`.
5. Invalidate the prepared result whenever the range or location changes. Require the planned
   “Vis dokumentation” action to prepare the new report before paginated entry loading starts.
6. Disable both export buttons whenever either completed or missing data is truncated.
7. Show a destructive Danish message asking for a shorter period. Do not render summary
   counts that could be mistaken for complete counts.
8. Guard `exportPdf` and `exportCsv` again inside the handlers so stale UI state cannot start
   an incomplete export.
9. Filter missing occurrences to `dueAt <= generatedAt`, where `generatedAt` is captured from
   server time by `prepareDocumentation`. Future scheduled checks are not missing or overdue.

## Constraints

- Kiosk documentation access remains intentionally supported.
- Attachment URLs remain location-scoped and generated per request.
- No partial report may be downloadable, even when accompanied by a warning.

## Verification

- More than 5,000 missing occurrences disables PDF and CSV export.
- More than 5,000 completed records disables PDF and CSV export.
- Exactly-at-cap results remain exportable only when the server proves the page is exhausted.
- A range extending into the future does not list not-yet-due occurrences as missing.
- A normal, complete range still exports identical record and missing counts on screen, in CSV,
  and in PDF.

---

# Task 2 · Make time deterministic and location-aware

## Goal

Time passing invalidates the relevant queries through arguments, and every scheduled time is
displayed in the location's resolved IANA time zone.

## Scope

- `convex/ownChecks.ts`
- `convex/ownCheckOverview.ts`
- `convex/ownCheckDocumentation.ts`
- `components/own-checks/today-own-checks.tsx`
- `components/own-checks/own-checks-overview.tsx`
- `components/own-checks/inspection-documentation.tsx`
- `components/organization/own-check-templates.tsx`

## Implementation

1. Add a required `now: v.number()` argument to display-time-dependent queries:
   - `listToday`;
   - `listOwnChecks`.
2. Validate that `now` is finite. It is display and derivation input, never an authorization
   boundary.
3. Remove every `Date.now()` call from Convex query handlers and helpers reached by queries.
   Mutations may continue using server time.
4. In the client, maintain a timestamp rounded or refreshed once per minute. Refresh it on:
   - a one-minute interval while the page is visible;
   - `visibilitychange` when the tab becomes visible;
   - location or date-range changes.
5. Let `listToday` derive its date from `now` and the resolved location time zone when no
   `dateKey` is supplied. Return `timeZone` in `listTodayOutput`.
6. Include `timeZone` on every overview row. Multi-location rows can have different zones.
7. Pass the returned zone to every `Intl.DateTimeFormat` used for due times, start times,
   performed times, and overdue labels.
8. Remove hardcoded `Europe/Copenhagen` from own-check page date helpers. For overview and
   documentation defaults, add small permission-specific date-context queries that return
   `{ timeZone, todayDateKey }` for the selected location and supplied `now`. Reuse a plain
   server helper for their shared implementation.
9. Make documentation generation time server-authoritative and stable:
   - `prepareDocumentation` captures `Date.now()` inside a mutation, where wall-clock reads are
     allowed;
   - return that value as `generatedAt` with the identifying header and missing checks;
   - retain the prepared result in client state while all completed-entry pages load;
   - use exactly that value for the screen, CSV/PDF metadata, missing-check cutoff, and
     deterministic PDF generation.
10. Generate interval-template anchor defaults from the selected location date context. Do
    not hardcode Copenhagen.

## Constraints

- Client time must not grant late-submission access, alter inspection-export completeness, or
  bypass count locks. Mutations continue to use server time for enforcement and report
  preparation.
- A kiosk remains pinned to its configured location.
- Do not add a timer or cron that materializes pending occurrences.

## Verification

- Leaving `/own-checks` open across local midnight replaces yesterday's plan with today's.
- A check becomes overdue without a database write or page reload.
- A user in one browser time zone viewing a location in another sees the location's local
  planned time.
- Two locations in different time zones show different correct local times in one overview.
- No production Convex query in the own-check module calls `Date.now()`.

---

# Task 3 · Centralize small server invariants and cap errors

## Goal

Policy defaults, limits, status derivation, and occurrence-cap errors have one implementation
each and produce stable Danish errors.

## Scope

- `convex/ownCheckTemplates.ts`
- `convex/lib/ownChecks.ts`
- `convex/ownChecks.ts`
- `convex/ownCheckOverview.ts`
- `convex/ownCheckDocumentation.ts`
- `lib/own-checks.ts`
- `lib/own-check-pdf.ts`

## Implementation

1. Make `getSettings` call `getOwnCheckConfiguration` or `configurationFrom`; remove the
   duplicated `?? 7`, `?? true`, and `?? false` defaults.
2. Reject template creation when the active count is already
   `MAX_ACTIVE_TEMPLATES` (`>= 200`), before inserting template 201.
3. Add one Convex-side occurrence-expansion wrapper in `convex/lib/ownChecks.ts`. It calls the
   pure `expandOccurrences` and converts only its known range/occurrence errors into
   `ConvexError` with the existing Danish messages. Unexpected exceptions must still surface
   as unexpected failures.
4. Use that wrapper from today, backlog, overview, and documentation queries.
5. Make `planItem` call the shared `ownCheckStatus` and `isOverdue` functions instead of
   duplicating them.
6. Replace unsupported PDF glyphs produced by our own layout code:
   - `>=` or `Mindst` instead of `≥`;
   - `<=` or `Højst` instead of `≤`;
   - `->` instead of `→`.
   User-provided unsupported characters should still be sanitized to `?`.

## Verification

- An organization with no settings row resolves to `7 / true / false` through the shared
  helper.
- Template 200 is allowed and template 201 is rejected.
- Range and occurrence cap failures reach the client as Danish messages, not `Server Error`.
- Status and overdue behavior remains unchanged for ordinary inputs.
- Generated PDFs contain readable limit and revision separators rather than `?` for symbols
  introduced by the application.

---

# Task 4 · Rewrite the overview data path

## Goal

The overview returns correct, bounded results for single- and multi-location scopes without
re-reading every template version once per location or filtering records after pagination.

## Scope

- `convex/schema.ts`
- `convex/ownCheckOverview.ts`
- `convex/lib/ownChecks.ts`
- `components/own-checks/own-checks-overview.tsx`

## Implementation

### Shared organization data

1. Resolve the caller's allowed location documents once, capped consistently with the rest of
   the access layer.
2. Resolve time zones without repeating organization fallback reads:
   - load the organization schedule fallback once;
   - load referenced markets once per distinct market;
   - prefer `location.timeZone`, then market, then organization fallback.
3. Compute the latest UTC end boundary across the resolved location zones.
4. Load organization template versions once using that boundary and the existing
   `MAX_TEMPLATE_VERSIONS` cap.
5. Reuse the version array for `expandOccurrences` per location and time zone.

### Entry queries and pagination

6. Keep pagination for entry-only status views, but apply all predicates before
   `.paginate()`:
   - organization;
   - allowed location scope;
   - requested local `dueDateKey` range;
   - status or `hasDeviation` semantics;
   - optional control type;
   - optional performer.
7. Add only the indexes needed for the leading query branches:
   - organization + location + status + due date;
   - organization + location + `hasDeviation` + due date;
   - organization + due date for multi-location date-range reads.
   Use an indexed leading range and a Convex query `.filter()` only for optional predicates
   not covered by the chosen index. Do not paginate first and filter the returned JavaScript
   array afterward.
8. Always enforce `entry.dueDateKey` within the requested inclusive range. This removes the
   current UTC `±1 day` leakage for multi-location queries.
9. Keep the `deviation` filter based on `hasDeviation`, including later-approved records.
10. Return an explicit `truncated: boolean`. Do not overload Convex's `pageStatus` metadata as
    an application truncation flag.
11. Move the UI to `usePaginatedQuery` with a modest page size and a Danish “Vis flere” action
    for entry-only views. Derived pending views may continue returning one bounded page with
    `isDone: true` and `truncated` when the 2,000-row cap is reached.
12. Preserve chronological ordering. Rows needing follow-up can sort first only within the
    same day without changing the cursor's underlying order.

## Index rollout

The own-check tables are new in this branch, so normal indexes are sufficient before the first
deployment. If the tables have already been deployed with production data, add the indexes as
staged indexes first, wait for backfill, then activate them in a second deployment.

## Verification

- A multi-location query loads template versions once, not once per location.
- A status-filtered page containing many nonmatching entries still returns the requested
  matches and a usable continuation cursor.
- A location-scoped member never receives another location's rows.
- A multi-location date range returns no entry whose `dueDateKey` lies outside the range.
- More than one page can be loaded from the UI without duplicates or omissions.
- A large but permitted organization remains within Convex document-read limits.

---

# Task 5 · Preserve audit attribution during amendments

## Goal

Editing values or notes does not silently claim that the editor originally recorded an
unchanged deviation or corrective action.

## Scope

- `convex/ownChecks.ts`
- `convex/lib/ownChecks.ts`
- `components/own-checks/own-check-record.tsx`

## Implementation

1. Normalize each submitted text once at the start of `editOwnCheck`.
2. For `deviation` and `correctiveAction` independently:
   - when the argument is omitted, preserve the stored note object;
   - when normalized text equals the stored description, preserve the complete stored object,
     including original actor and timestamp;
   - when text changes, create a new note object attributed to the editor and revision time;
   - when a record has or introduces a deviation, reject an empty deviation description. Do
     not substitute `"Afvigelse registreret"` for a cleared compliance statement.
3. Update the edit dialog to omit unchanged deviation and corrective-action arguments where
   practical. The server comparison remains authoritative.
4. Keep `appendRevision` as the only writer to `ownCheckEntries`.
5. Continue recording the description change in `changes`; the full revision snapshot carries
   the new actor and timestamp.
6. Apply the approved-record policy selected in the decision section. Do not clear approval
   metadata without an explicit audit event.

## Verification

- Editing only a numeric value preserves the original deviation author and timestamp.
- Editing only the general note preserves corrective-action attribution.
- Changing deviation text attributes the new statement to the editor and stores the previous
  statement in the preceding revision.
- Clearing a required deviation description is rejected.
- Every successful amendment still writes exactly one revision and one audit-log row.

---

# Task 6 · Stabilize field keys and expose template history

## Goal

Field keys remain stable identifiers through label edits, newly added fields cannot collide,
and administrators can inspect every template version.

## Scope

- `convex/ownCheckTemplates.ts`
- `components/organization/own-check-templates.tsx`

## Implementation

1. Remove the editable field-key input from the template editor.
2. Generate a collision-resistant slug-compatible key once when a field is added. Prefer a
   short UUID-derived key such as `field-<uuid>` over `felt${fields.length + 1}`.
3. Preserve the key when label, type, limits, required state, or ordering changes.
4. Strengthen server validation for updates:
   - keys remain unique;
   - any field retained from the previous version keeps its key;
   - a label rename does not require or produce a new key;
   - newly introduced keys must not collide with any key in the submitted version.
5. Keep deletion and addition distinct in the client state so replacing a field is not
   accidentally presented as a rename.
6. Load `getTemplate` when an existing template editor opens.
7. Add the planned read-only version-history section showing version number, validity range,
   creator, and the fields/limits that belonged to that version.
8. Bound the history query with the known maximum practical version count or return a Danish
   error if the safety cap is exceeded; do not leave an unbounded `.collect()`.

## Verification

- Delete field 2 of 3, add a field, and save without a key collision.
- Rename a field and confirm its key remains unchanged in the new version.
- Reorder or change a field type without changing its key.
- Version history shows adjacent `validTo`/`validFrom` boundaries and historical fields.
- Existing entries still render using their stored template version.

---

# Task 7 · Fix backlog truncation and remaining plan gaps

## Goal

Truncated data is never presented as authoritative, and the smaller deviations from the
original plan are completed without expanding scope.

## Scope

- `convex/ownChecks.ts`
- `convex/lib/auth.ts`
- `components/own-checks/own-check-sheet.tsx`
- `components/own-checks/today-own-checks.tsx`
- `components/own-checks/own-checks-overview.tsx`
- `lib/compress-image.ts`

## Implementation

1. In `listToday`, if backlog entries exceed `MAX_BACKLOG_OCCURRENCES`, return an empty backlog
   with `truncated: true`. Do not subtract occurrences from a partial entry set.
2. Call `requireOwnCheckPerformer` for both permitted page contexts:
   `['ownChecks.today', 'ownChecks.overview']`, matching the original contract.
3. Re-encode every browser-decodable image selected for an attachment to JPEG, not only files
   already labelled JPEG or PNG. Keep PDFs unchanged. If the browser cannot decode an image,
   show a Danish format error before upload.
4. Permit reattaching a storage object previously detached from the same entry:
   - continue rejecting files active on another entry or organization;
   - insert a new attachment lifecycle row for the new `addedAtRevision`;
   - never rewrite the previous row's removal revision.
5. When a location has no applicable templates, show the planned manager-only link to
   `/organization/own-checks`.
6. Replace hardcoded or duplicated client status logic where the shared helpers already match
   the required behavior.

## Verification

- A capped backlog displays a truncation warning and no false missing rows.
- Kiosk access behaves correctly from both today and overview page contexts.
- A supported non-JPEG browser image is uploaded as JPEG; PDF remains PDF.
- Removing and later reattaching the same stored file produces two non-overlapping attachment
  lifecycle rows and remains visible in the correct revisions.
- Only users with `ownChecks.manage` see the template-management hint.

---

# Task 8 · Complete regression coverage

## Goal

Tests pin the security, policy, query, export, and audit behaviors most likely to regress.

## Scope

- `convex/ownChecks.test.ts`
- `lib/own-checks.test.ts`
- `lib/own-check-pdf.test.ts`
- focused component or pure-helper tests only where server tests cannot cover the behavior

## Required cases

1. Kiosk documentation succeeds when enabled and fails when documentation is disabled.
2. A template edit between submissions leaves the first entry and revision snapshot unchanged.
3. A default manager can edit with a reason; a default member cannot.
4. The default late window accepts seven days back and rejects eight days back.
5. A performer with `ownChecks.manage` can use the self-approval escape hatch.
6. An unchanged deviation and corrective action preserve their original actor and timestamp
   after an unrelated edit.
7. A renamed field retains its key.
8. Template 201 is rejected.
9. A truncated missing list disables the report-ready state through a pure exported helper or
   focused component test.
10. A truncated backlog contains no false missing rows.
11. Multi-location status results contain only the requested date keys and allowed locations.
12. Pagination returns matching records even when earlier indexed rows do not match optional
    filters.
13. DST tests assert the exact expected UTC instants on both Copenhagen transition dates, not
    only date-key round trips.
14. Add an interval-schedule expansion case.
15. PDF tests assert application-generated limit and revision separators survive sanitization.

## Verification

Run the full baseline:

```bash
bun run test
bun run lint
bun run build
```

Also run a manual tablet-sized pass:

- leave today's page open until a minute boundary and confirm overdue state refreshes;
- switch between two locations with different time zones;
- paginate a filtered overview;
- attempt PDF and CSV export from complete and deliberately truncated reports;
- edit a record without changing its deviation and inspect attribution and revisions;
- rename a template field and inspect version history.

---

# Final review checklist

- No own-check Convex query reads the wall clock.
- No partial data set can be exported as complete inspection documentation.
- No filtering that affects result membership happens after pagination.
- Organization and location scope checks remain on every public function.
- Template versions remain append-only except for setting `validTo`.
- `ownCheckEntries` is patched only by `appendRevision`.
- `hasDeviation` never changes from `true` to `false`.
- Unchanged compliance statements retain their original actor and timestamp.
- Field keys remain stable through ordinary edits and label changes.
- Settings defaults exist only in `configurationFrom` and its constant.
- PDF generation introduces no unsupported WinAnsi symbols itself.
- The approved-record policy is documented and tested according to the product decision.
