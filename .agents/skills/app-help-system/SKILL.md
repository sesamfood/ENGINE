---
name: app-help-system
description: Change the help landing page, navigation, search, routes, visibility, or rendering. Use app-help-pages for guide copy.
---

# App help system

1. Trace `components/help/help-features.ts` through `use-visible-help.ts` to the affected renderer. Routes live in `app/help/`; `help-shell.tsx` builds navigation and search data.
2. Keep displayed guides, search, navigation, and pagination on `useVisibleHelp`. Static routes use the full collection; hidden guides retain their unavailable-page state.
3. Preserve nested paths, breadcrumbs, redirects, and `/help/<feature>/overblik`. Update affected consumers when the content contract changes.
4. Preserve signed-out help access. Provider content stays hidden until its enabled state is known.
5. Check an overview and nested guide, direct links, section anchors, mobile navigation, and keyboard search. For visibility changes, check enabled and disabled integrations.

Use [app-ui](../app-ui/SKILL.md) for component changes. Preserve Danish search normalization and focus return from overlays.
