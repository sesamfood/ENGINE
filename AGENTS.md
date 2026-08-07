<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project overview

This project is a backend system for multi-restaurant chains. It is a white-label product and must remain company-agnostic. Do not introduce branding, terminology, workflows, or assumptions that tie the system to a single restaurant company unless explicitly requested.

The system should support practical customization without becoming a general-purpose platform. Prioritize user and role management, especially clear control over which actions each role is allowed to perform.

# Product and interface principles

- Write all user-facing interface text in Danish.
- Design primarily for tablets and desktop computers. It is important that touch works well in the interface.
- Keep the product usable on phones with responsive layouts and interactions.
- Make frequent and important actions prominent, direct, and easy to understand.
- Minimize the number of taps or clicks required to complete important actions.
- Put supplementary settings guidance in the existing question-mark help tooltip pattern when the field label is clear on its own.

# Technology stack

- Use Next.js for the application and target deployment on Vercel.
- Use Better Auth for authentication, organization management, users, and roles. Treat Better Auth organizations as the tenant boundary that enables the white-label model.
- Use Convex for database storage and synchronization.
- Use shadcn/ui components wherever a suitable component exists. Prefer composing or adapting those components over creating replacements from scratch. Always use the shadcn skill when creating UI.

# Organization and data model

- One Better Auth organization represents an entire restaurant chain.
- Restaurant locations belong to and are managed beneath their organization.
- Scope every organization-owned record to its Better Auth organization.
- Never expose or allow access to data across organizations.
- Sales history is provider-agnostic (`salesOrders`, `salesLines`, `salesDaily`; money in integer minor units). OnlinePOS only fills it via `convex/onlinePosSync.ts`. Reads and dashboard metrics go through `convex/sales.ts` / `salesDaily` and must not call a provider API.

# Authentication and authorization

- Enforce organization membership, roles, and permissions on the server in Convex queries, mutations, and actions.
- Treat client-side permission checks and hidden UI controls as usability features, not security boundaries.
- Grant users only the permissions required for their role.
- Keep permission checks centralized and consistent so the same action is governed by the same rules throughout the system.

# White-label customization

- Allow organizations to customize their name, logo, colors, and enabled features.
- Keep customization within defined options rather than introducing organization-specific code paths.
- Do not hardcode company names, branding, organization IDs, or location IDs.

# User experience and accessibility

- Give users immediate and clear feedback after important actions.
- Require confirmation before destructive or difficult-to-reverse actions.
- Support keyboard navigation and visible focus states.
- Maintain readable color contrast and touch targets suitable for tablet use.

# Implementation principles

- Do not introduce alternatives to Better Auth, Convex, or shadcn/ui without explicit approval.
- Prefer simple, direct implementations over speculative abstractions.
- Reuse existing components and patterns before adding new ones.
- Avoid adding dependencies when the existing stack or platform can solve the problem clearly.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

# External API documentation

- Workfeed: https://docs.workfeed.io/
- OnlinePOS: https://speca.io/SimonOnlinePOS/external-api-v2?key=41502b8375f30e56b210877ef797b7e4

# Dashboard widgets

A dashboard widget is a metric, a compatible visualization, and a fixed size. To add a metric:

1. Add its id and Danish metadata to `lib/dashboard/registry.ts`.
2. Add its Convex implementation to the exhaustive `dashboardMetricComputers` record in `convex/lib/dashboardMetrics.ts`.
3. Do not add widget-specific UI. The add-widget dialog reads the registry automatically.

Every metric returns this contract:

```ts
type MetricResult = {
  unit: "count" | "currency" | "percent" | "quantity" | "hours";
  series: Array<{
    key: string;
    label: string;
    points: Array<{ t: number; value: number }>;
    total: number;
    previousTotal: number | null;
  }>;
  breakdown?: Array<{ key: string; label: string; value: number }>;
  target?: number;
  truncated?: boolean;
};
```

See `docs/dashboard-widgets.md` for visualization, sizing, sharing, and data-domain rules.
