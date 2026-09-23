---
name: app-integrations
description: Add or change built-in provider integrations in this app, including connections, settings, sync jobs, webhooks, and activation behavior.
---

# App integrations

## Find the provider boundary

Read `integrations/README.md` before implementation and `integrations/credentials.md` when credentials or connection lifecycle are involved. These own the integration and secret-storage rules. Read the provider's existing module and the closest equivalent provider before choosing a structure.

Use [convex-expert](../convex-expert/SKILL.md) and read `convex/_generated/ai/guidelines.md` before backend edits. For provider API work, consult the provider's current official documentation; links for existing providers are in `AGENTS.md`. Keep provider behavior separate from the core business records it imports or exports.

## Wire the affected parts

For a new provider, follow these connections. For an existing provider, change only the affected ones.

| Concern | Entry points |
| ------- | ------------ |
| Provider identity and overview | `integrations/registry.ts` |
| Settings component and client entrypoint | `integrations/<provider>/components/`, `integrations/<provider>/client.ts`, `components/integrations/integration-detail.tsx` |
| Activation types, state, and lifecycle dispatch | `convex/integrations/state.ts`, `convex/integrations.ts`, `convex/schema.ts` |
| API clients, provider tables, jobs, lifecycle | `convex/integrations/<provider>/` |
| Table composition, schedules, callbacks | `convex/schema.ts`, `convex/crons.ts`, `convex/http.ts`, as needed |
| Visible controls and data-source choices | `integrations/use-integrations.ts`, `integrations/dashboard.ts`, and affected consumers |
| Provider help | `integrations/<provider>/help.ts`, composed in `components/help/help-integrations.ts` |

Search for the nearest provider's ID to find exhaustive unions, return validators, and state shapes that also need the new ID. New providers start disabled; legacy fallback is only for providers with existing installations.

## Preserve lifecycle behavior

- Use the shared activation helpers, including before asynchronous results commit. Activation, stored credentials, and a connected account are separate states.
- Disabling prevents new work and preserves credentials, mappings, and history. Handle already-sent requests so late results do not lose rotated tokens or create duplicate exports; follow the provider lifecycle rules in `integrations/README.md`.
- Authenticate public calls through `convex/lib/auth.ts`; enforce organization ownership and permitted locations on mappings and imported records. For callbacks, verify the provider request and resolve the organization from a stored connection.
- Keep public settings responses limited to connection metadata and secret-presence indicators. Follow the shared credential implementation rather than creating another encryption scheme.
- Retain top-level Convex re-exports while deployed clients or queued jobs use those function addresses.

Use [app-ui](../app-ui/SKILL.md) for settings controls and [app-help-pages](../app-help-pages/SKILL.md) for provider guidance. Gate provider-specific help and controls by integration state; the overview remains the place to enable a provider.

## Verify the change

Check the affected behavior with the provider enabled, disabled, and unconnected, plus a user without the required permission or location access. For async changes, check disabling during a run and retrying the same response. Use existing focused checks and local fixtures where available; report any live-provider behavior that could not be verified. Typecheck changes to provider IDs, validators, or registration.
