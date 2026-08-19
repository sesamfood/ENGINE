# Restaurant Operations

Next.js application with Convex as the backend and Better Auth for authentication, organizations, and roles.

## Local development

Copy `.env.example` to `.env.local`, start Convex, and then start Next.js:

```bash
bunx convex dev
bun dev
```

Set the Better Auth backend variables on the relevant Convex deployment:

```bash
bunx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
bunx convex env set SITE_URL http://localhost:3000
bunx convex env set BETTER_AUTH_TRUSTED_ORIGINS "http://localhost:3000,https://admin.example.com"
bunx convex env set RESEND_API_KEY re_...
bunx convex env set RESEND_FROM_EMAIL "System <noreply@example.com>"
```

Set `BETTER_AUTH_TRUSTED_ORIGINS` to a comma-separated list when the app should accept requests from more than one frontend URL. Keep `SITE_URL` set to the canonical URL used in generated links and emails.

Use a verified sender or verified domain in Resend. Set the same variables for production using `--prod` and the public `SITE_URL`.

## Documentation

- [Convex + Better Auth for Next.js](https://labs.convex.dev/better-auth/framework-guides/next)
- [Better Auth organization plugin](https://better-auth.com/docs/plugins/organization)
