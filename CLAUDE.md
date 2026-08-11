@AGENTS.md

## Interface language

- Write all user-facing interface text in Danish.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Dashboard widgets

When adding a metric, add its Danish metadata to `lib/dashboard/registry.ts`, including a non-empty `formula` and at least one `sourceTables` entry naming the tables actually read by its `dashboardMetricComputers` implementation. Keep the computation in `convex/lib/dashboardMetrics.ts` exhaustive and unchanged by metadata-only work; the widget information popover and add-widget dialog read the registry automatically.
