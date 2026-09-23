---
name: app-ui
description: Create or change this app's screens, forms, controls, layout, and interactions using its shared shells, shadcn components, Danish copy, and tablet-oriented patterns.
---

# App UI

## Match the existing surface

Read the relevant product, terminology, and accessibility rules in `AGENTS.md`. Use [shadcn](../shadcn/SKILL.md), then inspect `components.json`, the local component implementation, and the closest screen in the same workflow. Follow the Next.js documentation rule in `AGENTS.md` when changing route or server/client behavior; if the bundled guides are unavailable, consult official documentation for the project's installed version.

When the requested visual direction is unclear, show a few distinct options before changing production UI. For a routine change within an established screen, follow its existing design.

## Use the app's structure

- Routes live in `app/`; feature screens and forms live in `components/<area>/`. Check the parent layout before adding a header, auth gate, or navigation: it may already supply them.
- `AppRouteShell` selects the app shell. `AppPageHeader` places controls in the desktop header and in the page on small screens. Reuse it for screens following that pattern.
- Operational sections use `AppBottomBar` and route-driven tabs; inspect `components/waste/waste-navigation.tsx` or the neighboring feature. Keep selected tabs tied to the URL, permission-based destinations, and browser history.
- Use `useAccess`, `usePermission`, and `useLocationAccess` from `components/app-shell.tsx` for presentation. Reuse `LocationField` and the current feature's location-selection behavior. Server functions still enforce access.
- Reuse domain controls such as `QuantityInput`, `ProductUnitLine`, and `PhotoField` when their behavior fits. Inspect their props before composing a replacement.

## Compose and style

- This repo uses Base UI-backed shadcn primitives. Follow local `render` composition and component props rather than assuming Radix `asChild` examples apply.
- Read `eslint.config.mjs` before styling. Caller classes handle layout; visual changes belong in the component's existing `variant`, `size`, or `appearance` API. If a shared variant must change, inspect its other consumers.
- Use semantic theme tokens from `app/globals.css` so organization colors and light/dark themes keep working. Keep classes static and follow the configured shadcn lint rules.
- For settings whose label is clear, put supplementary guidance in `components/ui/help-tooltip.tsx`. Keep validation errors and information needed to complete the action visible.
- Write new interface text in Danish using the fixed vocabulary in `AGENTS.md`. Show concrete terms such as Lokation, marked, or operatør in selection controls.

## Interaction and verification

Keep frequent actions prominent on tablet and desktop, with usable phone layouts. Follow the existing touch-sized controls, labelled fields, keyboard focus, and overlay behavior. Preserve loading, empty, denied, pending, error, and success states that the changed workflow can reach; prevent duplicate submissions while an action is pending. Confirm destructive or difficult-to-reverse actions in the product UI.

Inspect the changed screen at tablet/desktop and narrow widths, using keyboard and touch-sized targets. Check light/dark contrast and long Danish labels where affected. Run the existing lint check on changed TSX files and typecheck changed component contracts. State what was checked and any browser verification that remains unavailable.
