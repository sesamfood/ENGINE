---
name: app-help-pages
description: Write or update this app's Danish help guides, task instructions, troubleshooting, related links, and screenshots. Use app-help-system for help navigation, search, or rendering changes.
---

# App help pages

## Establish what the user can do

Read the relevant screen, its permission checks, and the backend behavior behind the steps being documented. Describe the shipped workflow, including prerequisites and the result the user should see. Use `AGENTS.md` for Danish terminology and `CONTEXT.md` for domain definitions. Keep existing copy outside the requested change intact.

For an existing guide, find its slug and inbound links before editing. Keep URLs and section IDs stable where possible. A renamed label does not require a renamed slug.

## Edit the content source

Read `components/help/help-types.ts` and a neighboring guide. Help pages are typed data rendered by shared components.

| Topic | Content source |
| ----- | -------------- |
| Daily operations | `components/help/help-operation-guides.ts` |
| Administration, access, profile, and settings | `components/help/help-administration-guides.ts` |
| A provider's setup or operation | `integrations/<provider>/help.ts` |
| Integration overview and provider guide composition | `components/help/help-integrations.ts` |

- Follow `HelpGuide`: give it a slug, label, summary, real `appHref`, action label, and sections. Use `steps` for an ordered task, `bullets` for parallel conditions, and `paragraphs` for explanations. These strings render as text, not Markdown or HTML.
- State the needed permission or location access in user terms. Include troubleshooting only for supported causes and recovery actions.
- Nest `children` for a subtask that needs its own page. Each guide slug must be unique among siblings; section IDs must be unique on the page, including renderer-owned anchors such as `guides`, `troubleshooting`, and `related-title`.
- A new top-level topic needs a `HelpFeature` in the appropriate collection and an `overblik` guide: `/help/<feature>` redirects there. Existing collections are composed in `components/help/help-features.ts`.
- Add `integration` to provider-dependent guides, sections, screenshots, troubleshooting entries, and related links as applicable. A provider guide is gated as a whole; provider-only material inside a general guide needs its own gate.
- Use existing related pages and real app routes. Link text should identify the destination or action.

Content additions flow into navigation, search, breadcrumbs, and pagination through the shared data. Use [app-help-system](../app-help-system/SKILL.md) only when the content needs a change to those mechanics.

## Screenshots

Use current captures of the actual app with non-sensitive sample data. Store help images in `public/help/screenshots/` and reference them as `/help/screenshots/...`. Inspect the image before using it; set its real pixel dimensions and Danish alt text and caption. A screenshot should clarify a specific step and remain legible when enlarged by `HelpScreenshot`.

If a suitable capture is unavailable, write accurate text without an image and state the gap. Add a screenshot only when it exists and matches the documented behavior.

## Verify the guide

Check the rendered guide URL, app link, related links, section anchors, and any image enlargement. Confirm the guide appears in search and navigation, and provider-only material disappears when that integration is disabled. Run the existing lint/type checks appropriate to the changed TypeScript data. Report any rendering or authenticated workflow you could not inspect.
