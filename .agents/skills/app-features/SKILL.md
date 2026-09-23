---
name: app-features
description: Add or extend a product feature in this app across data, permissions, navigation, and UI. Use for a new workflow or capability; use the narrower app skills for isolated UI, help, or integration edits.
---

# App features

## Trace one user action

Read `AGENTS.md` and `docs/agents/domain.md`, then follow the closest existing workflow from route to component to Convex function and stored records. Identify the result the user asked for, who may perform it, which organization and locations it affects, and what already exists to reuse. Resolve only uncertainties that would change the result.

Keep the implementation within the requested feature. A small extension to an existing workflow usually needs no new top-level feature, role, setting, or abstraction.

## Follow the affected branches

- **Backend:** use [convex-expert](../convex-expert/SKILL.md) and read `convex/_generated/ai/guidelines.md`. Keep organization-owned records under the Better Auth tenant and follow existing indexes and domain write paths. For stored-data changes, inspect existing records and use [convex-migration-helper](../convex-migration-helper/SKILL.md) when compatibility or backfill is required.
- **Permissions:** read `lib/auth-permissions.ts` and `convex/lib/auth.ts`. Reuse an existing permission when it represents the same action; otherwise update the catalog and decide built-in role defaults explicitly. Use the centralized server helpers and verify ownership of every referenced record as well as permitted locations. Client visibility is supplementary.
- **New top-level feature:** trace `lib/sidebar-navigation.ts`, `lib/features.ts`, `lib/app-navigation.ts`, `convex/lib/features.ts`, and `convex/features.ts`. Keep IDs, labels, paths, permission-based destinations, and organization feature switches consistent. Trace `convex/navigation.ts` and `components/app-shell.tsx` for the resulting navigation. Existing-feature additions only need the relevant subset.
- **Operational workflow:** inspect neighboring behavior for active Count restrictions, kiosk destinations, location locks, and organization switching. Use `lib/kiosk.ts` and existing server guards when the workflow is intended for kiosk use; ordinary membership alone does not define kiosk access.
- **UI:** use [app-ui](../app-ui/SKILL.md). Keep route components thin and put workflow components alongside their peers.
- **Provider work:** use [app-integrations](../app-integrations/SKILL.md). Keep core records usable when integrations are disabled.
- **Help:** use [app-help-pages](../app-help-pages/SKILL.md) when the feature adds a user workflow or makes an existing guide inaccurate. Update the affected guide, not unrelated copy.

For Better Auth session, organization, or role wiring changes, use the relevant installed Better Auth skill. Existing Convex authorization remains the source of truth for app actions.

## Dashboard metrics

For a new built-in metric, read the dashboard rules in `AGENTS.md` and `CLAUDE.md`. Add metadata in `lib/dashboard/registry.ts` and the computation in `convex/lib/dashboardMetrics.ts`, preserving the shared `MetricResult` contract. Supply a formula and source tables that match the computation. The widget picker reads the registry; a metric does not need custom picker UI. Read stored provider-agnostic sales data for reports rather than calling a provider API.

## Finish at the requested boundary

Use the smallest relevant existing checks from `package.json` and the affected test files; add tests only when requested. Verify the main user action and the access cases it changes: missing permission, another organization, a disallowed location, and disabled feature or integration where applicable. Include empty/pending/error behavior for changed UI and compatibility for changed stored records.

Report the behavior delivered, checks run, and any unverified dependency. Use [convex-deploy-guard](../convex-deploy-guard/SKILL.md) before a deployment-affecting command. Keep deployments, live provider actions, issue publication, and PR creation within the user's authorization; completing a feature does not itself request them.
