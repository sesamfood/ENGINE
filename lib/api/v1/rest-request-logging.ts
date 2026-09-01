import { SeverityNumber } from "@opentelemetry/api-logs";
import { after } from "next/server";
import {
  loggerProvider,
  posthogLogsConfigured,
} from "@/instrumentation";

export type RestRequestLogDetails = {
  requestId: string;
  operationId: string;
  status: number;
  latencyMs: number;
  organizationId: string | null;
  apiKeyId: string | null;
  replayed: boolean;
  problemCode: string | null;
  responseBytes: number | null;
  rateLimited: boolean;
  rateLimitRemaining: number | null;
};

type RestRequestSeverity = {
  severityNumber: SeverityNumber;
  severityText: "ERROR" | "WARN" | "INFO";
};

type ScalarAttribute = string | number | boolean;

const logger = loggerProvider.getLogger("engine");

function severityForStatus(status: number): RestRequestSeverity {
  if (status >= 500) {
    return {
      severityNumber: SeverityNumber.ERROR,
      severityText: "ERROR",
    };
  }
  if (status >= 400) {
    return {
      severityNumber: SeverityNumber.WARN,
      severityText: "WARN",
    };
  }
  return {
    severityNumber: SeverityNumber.INFO,
    severityText: "INFO",
  };
}

function addAttribute(
  attributes: Record<string, ScalarAttribute>,
  key: string,
  value: ScalarAttribute | null | undefined,
) {
  if (value !== null && value !== undefined) {
    attributes[key] = value;
  }
}

function posthogAttributes(
  details: RestRequestLogDetails,
): Record<string, ScalarAttribute> {
  const attributes: Record<string, ScalarAttribute> = {
    event: "rest_api.request",
    requestId: details.requestId,
    operationId: details.operationId,
    status: details.status,
    latencyMs: details.latencyMs,
    replayed: details.replayed,
    rateLimited: details.rateLimited,
  };
  addAttribute(attributes, "organizationId", details.organizationId);
  addAttribute(attributes, "apiKeyId", details.apiKeyId);
  addAttribute(attributes, "problemCode", details.problemCode);
  addAttribute(attributes, "responseBytes", details.responseBytes);
  addAttribute(
    attributes,
    "rateLimitRemaining",
    details.rateLimitRemaining,
  );
  return attributes;
}

export function logApiRequest(details: RestRequestLogDetails): void {
  if (details.status >= 500) console.error("REST API request", details);
  else if (details.status >= 400) console.warn("REST API request", details);
  else console.info("REST API request", details);

  if (!posthogLogsConfigured) return;

  const severity = severityForStatus(details.status);
  logger.emit({
    eventName: "rest_api.request",
    body: "REST API request",
    severityNumber: severity.severityNumber,
    severityText: severity.severityText,
    attributes: posthogAttributes(details),
  });

  after(() => loggerProvider.forceFlush());
}
