---
name: app-help-system
description: Change the app's help landing page, navigation, search, routing, integration visibility, guide renderer, or image viewer. Guide copy belongs in app-help-pages.
---

# App help system

## Trace the shared data flow

Start at the component responsible for the requested behavior:

| Behavior | Source |
| -------- | ------ |
| Content contract and collection | `components/help/help-types.ts`, `components/help/help-features.ts` |
| Organization-specific visibility | `components/help/use-visible-help.ts` |
| Landing page | `components/help/help-index.tsx` |
| Navigation and search document construction | `components/help/help-shell.tsx` |
| Navigation, search interaction | `components/help/help-navigation.tsx`, `components/help/help-search.tsx` |
| Guide body, children, previous/next links | `components/help/help-guide-page.tsx`, `components/help/help-guide-list.tsx`, `components/help/help-pagination.tsx` |
| Image enlargement | `components/help/help-screenshot.tsx` |
| Routes and legacy redirects | `app/help/` |

Use [app-ui](../app-ui/SKILL.md) for component and interaction changes. Before changing Next.js routing, follow the documentation rule in `AGENTS.md`. If the bundled guide is unavailable, consult official Next.js documentation for the project's installed version.

## Keep the consumers consistent

- Keep `helpFeatures` and `flattenGuides` as the shared route data. Use `useVisibleHelp` for displayed content, navigation, search, and pagination; it recursively filters provider-dependent content before flattening.
- Static route generation reads the full collection. Integration filtering controls what the current visitor sees. Preserve the unavailable-page behavior for direct links to hidden guides; this filtering is not an authorization boundary for app data.
- `/help/<feature>` redirects to `/help/<feature>/overblik`. Keep an overview for each feature. Preserve existing redirects and add a targeted redirect when an intentional URL change would break published links.
- Keep nested guide paths, parent breadcrumbs, selected navigation, and pagination derived from the same hierarchy. When extending the content schema, update each affected consumer, including search text and visibility filtering.
- Search supports Danish spelling normalization, keyboard selection, and section anchors. Search results must lead to an anchor rendered on the visible page.
- Help has its own shell and is exempt from the authenticated app shell in `components/app-route-shell.tsx`. Preserve ordinary help access without a session and hide integration-specific material until its enabled state is known.

Use [app-help-pages](../app-help-pages/SKILL.md) when the task also changes guide content.

## Verify the affected paths

Inspect the landing page, a topic overview, and a nested guide for shared changes. Check direct links, breadcrumbs, anchors, previous/next links, and narrow-screen navigation. For search or overlay changes, check keyboard opening, selection, Escape, and focus return. For visibility changes, check signed-out access and enabled/disabled integrations. Use existing lint/type checks for the changed files and state any browser checks that could not run.
