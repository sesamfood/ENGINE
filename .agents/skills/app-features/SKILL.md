---
name: app-features
description: Add or extend a product workflow across data, permissions, navigation, and UI. Use narrower app skills for isolated edits.
---

# App features

1. Read `docs/agents/domain.md`. Trace the closest workflow from route to component, Convex function, and stored records.
2. Define the requested result, allowed roles, and organization/location boundaries. Extend existing behavior before adding a top-level feature.
3. Reuse permissions and guards in `lib/auth-permissions.ts` and `convex/lib/auth.ts`. For new permissions, choose built-in role defaults explicitly.
4. For a new top-level feature, trace `lib/sidebar-navigation.ts`, `lib/features.ts`, `lib/app-navigation.ts`, and `convex/lib/features.ts`. Keep IDs, routes, feature switches, Count restrictions, and kiosk access consistent.
5. Use `app-ui`, `app-integrations`, and `app-help-pages` for affected work. For metrics, follow the dashboard rules in `AGENTS.md` and `CLAUDE.md`.
6. Run relevant existing checks. Verify the main action, denied access, organization/location isolation, and disabled states. Report unverified behavior.

Use `convex-migration-helper` when stored-data changes need compatibility or backfill. Stay within the requested feature and existing authorization.
