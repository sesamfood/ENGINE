---
name: app-ui
description: Create or change this app's screens, forms, controls, layouts, and interactions.
---

# App UI

1. Use [shadcn](../shadcn/SKILL.md). Inspect the nearest screen, its parent layout, and local component props before editing.
2. Reuse `AppPageHeader`, `AppBottomBar`, and domain controls where the workflow fits. Keep route tabs tied to the URL and permitted destinations.
3. Follow Base UI `render` composition. Caller classes handle layout; visual changes use component variants. Follow `eslint.config.mjs` and theme tokens in `app/globals.css`.
4. Use access hooks from `components/app-shell.tsx` for presentation and existing server guards for authorization. Preserve location locks and organization-switch behavior.
5. Put supplementary settings guidance in `HelpTooltip`; keep validation and required instructions visible.
6. Check tablet and phone layouts, keyboard focus, touch targets, and affected loading/error states. Run focused lint and type checks.

Follow Danish copy and design rules in `AGENTS.md`. For Next.js changes, read bundled guides; if unavailable, consult official docs for the installed version.
