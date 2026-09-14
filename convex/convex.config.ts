import { defineApp } from "convex/server";
import { v } from "convex/values";
import migrations from "@convex-dev/migrations/convex.config.js";
import presence from "@convex-dev/presence/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import betterAuth from "./betterAuth/convex.config";

const app = defineApp({
  env: {
    BETTER_AUTH_SECRET: v.optional(v.string()),
    ECONOMIC_ENCRYPTION_KEY: v.optional(v.string()),
    GOOGLE_PLACES_API_KEY: v.optional(v.string()),
    OPENWEATHER_API_KEY: v.optional(v.string()),
    NOMINATIM_URL: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
  },
});

app.use(betterAuth);
app.use(migrations);
app.use(presence);
app.use(rateLimiter);

export default app;
