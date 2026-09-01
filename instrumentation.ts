import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { logs } from "@opentelemetry/api-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";

const posthogApiKey = process.env.POSTHOG_API_KEY?.trim();

export const posthogLogsConfigured = posthogApiKey?.startsWith("phc_") ?? false;

// Create LoggerProvider outside register() so it can be exported and flushed in route handlers.
export const loggerProvider = new LoggerProvider({
  resource: resourceFromAttributes({ "service.name": "engine" }),
  processors: posthogLogsConfigured
    ? [
        new BatchLogRecordProcessor({
          exporter: new OTLPLogExporter({
            url: "https://eu.i.posthog.com/i/v1/logs",
            headers: {
              Authorization: `Bearer ${posthogApiKey}`,
              "Content-Type": "application/json",
            },
          }),
        }),
      ]
    : [],
});

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (!posthogLogsConfigured) {
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        "PostHog Logs disabled: POSTHOG_API_KEY is missing or invalid.",
      );
    }
    return;
  }

  logs.setGlobalLoggerProvider(loggerProvider);
}
