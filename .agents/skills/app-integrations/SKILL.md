---
name: app-integrations
description: Add or change this app's providers, connections, sync jobs, webhooks, or integration settings.
---

# App integrations

1. Read `integrations/README.md`. For credentials or connection changes, also read `integrations/credentials.md`.
2. Follow the closest provider: settings and help in `integrations/<provider>/`, backend in `convex/integrations/<provider>/`. Keep business records in core.
3. Wire new providers into `integrations/registry.ts`, `components/integrations/integration-detail.tsx`, and `convex/integrations.ts`. Search the neighboring provider's ID for remaining validators, lifecycle, schema, cron, and HTTP wiring.
4. Start new providers disabled. Keep activation separate from account connection. Recheck activation before committing asynchronous results.
5. Verify enabled, disabled, and unconnected states; denied access; and disabling during a run. Check retries preserve credentials and avoid duplicate exports.

Use current official provider documentation. Preserve stored history and compatibility exports. Follow the shared credential implementation; public queries return secret-presence indicators only.
