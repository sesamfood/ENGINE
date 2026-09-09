import posthog from "posthog-js";
import { redactAnalyticsProperties, redactAnalyticsUrl } from "@/lib/analytics-privacy";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (!token) {
  if (process.env.NODE_ENV === "development") {
    throw new Error(
      "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
    );
  }
} else {
  posthog.init(token, {
    api_host: "/ingest",
    ui_host: host ?? "https://eu.posthog.com",
    defaults: "2026-01-30",
    capture_exceptions: true,
    disable_session_recording: process.env.NODE_ENV === "development",
    // Flag requests bypass before_send and include unredacted initial URLs.
    advanced_disable_feature_flags: true,
    before_send(event) {
      if (!event) return null;
      return {
        ...event,
        properties: redactAnalyticsProperties(event.properties),
        ...(event.$set ? { $set: redactAnalyticsProperties(event.$set) } : {}),
        ...(event.$set_once ? { $set_once: redactAnalyticsProperties(event.$set_once) } : {}),
      };
    },
    session_recording: {
      recordHeaders: false,
      recordBody: false,
      slimDOMOptions: { script: true },
      maskCapturedNetworkRequestFn: (request) => ({
        ...request,
        name: redactAnalyticsUrl(request.name),
      }),
      maskAttributeFn: (_name, value) =>
        value.startsWith("/") || /^https?:\/\//i.test(value)
          ? redactAnalyticsUrl(value)
          : value,
    },
    debug: process.env.NODE_ENV === "development",
  });
}

// IMPORTANT: Never combine this approach with other client-side PostHog initialization
// approaches, especially components like a PostHogProvider.
// instrumentation-client.ts is the correct solution for initializing client-side
// PostHog in Next.js 15.3+ apps.
