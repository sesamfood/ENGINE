export function redactAnalyticsUrl(value: string) {
  try {
    const url = new URL(value, "https://internal.invalid");
    url.pathname = url.pathname.replace(
      /^\/(share|invitation)(?:\/.*)?$/i,
      "/$1/[redacted]",
    );
    url.search = "";
    url.hash = "";
    return value.startsWith("/") ? url.pathname : url.href;
  } catch {
    return "[redacted]";
  }
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.startsWith("/") || /^https?:\/\//i.test(value)) {
      return redactAnalyticsUrl(value);
    }
    return value.replace(/https?:\/\/[^\s"'<>]+/gi, redactAnalyticsUrl);
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return redactAnalyticsProperties(Object.fromEntries(Object.entries(value)));
  }
  return value;
}

export function redactAnalyticsProperties(properties: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, redactValue(value)]),
  );
}
