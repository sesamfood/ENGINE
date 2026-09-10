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

## Google Places

Enable Places API (New) in a Google Cloud project with billing, restrict the API key to that API, and set `GOOGLE_PLACES_API_KEY` in the target Convex deployment's environment variables. The key stays on the backend.

Link each location to its Google business listing in its location details, then add **Gæstescore (Google Maps)** to a dashboard. Scores load when the dashboard opens and refresh every 24 hours while it stays open. Changing the date or chart reuses scores already loaded in the current view. Reopening the dashboard or selecting another location can trigger new lookups; this is not a shared daily cache. The widget shows each location's rating out of 5; it does not store rating history or provide public sharing.

Google names, addresses, and scores are held only in the mounted view. The database stores the place ID and its verification time. Existing forecast coordinates stay unchanged until the user switches the forecast to the Google listing; Google coordinates are then resolved when weather data needs refreshing.

## Documentation

- [Convex + Better Auth for Next.js](https://labs.convex.dev/better-auth/framework-guides/next)
- [Better Auth organization plugin](https://better-auth.com/docs/plugins/organization)
