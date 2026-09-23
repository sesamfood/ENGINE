---
name: app-help-pages
description: Write or update Danish help guides and screenshots. Use app-help-system for navigation, search, or rendering.
---

# App help pages

1. Read the actual screen and backend behavior. Document prerequisites, actions, and visible results using the terminology in `AGENTS.md`.
2. Follow `components/help/help-types.ts` and a neighboring guide. Core guides live in `components/help/help-*-guides.ts`; provider guides in `integrations/<provider>/help.ts`.
3. Use steps for tasks, bullets for conditions, paragraphs for explanations. Strings render as plain text. Keep slugs and section IDs stable and unique; new topics need an `overblik` guide.
4. Gate provider-only guides and content with `integration`, including screenshots and related links inside general guides.
5. Check the guide URL, app link, anchors, search, and enabled/disabled visibility. Shared components handle navigation and rendering.

Screenshots must show the current app with non-sensitive sample data. Store them in `public/help/screenshots/` with real dimensions and Danish alt text and captions. Omit unavailable captures and report the gap.
