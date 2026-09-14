# Integrations

The application runs without an enabled integration. Each provider owns its settings UI in `integrations/<provider>/` and its backend in `convex/integrations/<provider>/`.

## Installation and credentials

`registry.ts` defines the available providers and settings pages. `use-integrations.ts` reads the organization's switches. Enabling an integration makes its setup and related controls available; connecting provider accounts remains a separate step.

`convex/integrations/state.ts` checks installation state on the server. Provider operations, scheduled jobs, and callbacks use that check, including a second check when an action commits its result. Existing organizations retain their old provider switches until explicitly changed.

Disabling stops new provider work. Requests already sent may finish. The app still saves rotated Wolt tokens and references to created e-conomic drafts so disabling does not lose credentials or cause duplicate exports.

Organizations supply their credentials through provider settings. See [Credential storage and migration](credentials.md) before removing legacy encryption values from an existing deployment.

## Backend boundaries

Each provider directory contains its API functions, jobs, API client helpers, and provider table definitions. Core business records, including employees, sales, expenses, and stock, stay in the application schema. Providers write those records through the existing application rules.

The framework connections are explicit:

- `convex/schema.ts` composes each provider's table definitions.
- `convex/crons.ts` calls each provider's cron registration function. e-conomic has no recurring job.
- `convex/http.ts` registers Wolt's HTTP handlers.
- Each provider's `lifecycle.ts` owns its legacy enabled state and installation effects. Workfeed and OnlinePOS cancel active sync runs on disable and restart synchronization on enable.
- Core workflows call provider helpers where needed, such as applying imported sales to stock or exporting an expense. Those operations check installation state.

The original top-level Convex modules re-export their provider implementations. These compatibility files preserve function addresses used by clients and queued jobs. They contain no provider logic. Keep the adapters while deployed clients or jobs can still reference their original addresses.

Provider settings components are loaded through their own client entrypoints. The integration overview owns the grid and installation toggles; each provider owns the content of its settings subpage.
