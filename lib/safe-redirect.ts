export function safeRedirect(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020\u007f-\u009f]/.test(value)
  ) {
    return "/onboarding";
  }

  const origin = "https://internal.invalid";
  const destination = new URL(value, origin);
  if (destination.origin !== origin || destination.pathname.startsWith("//")) {
    return "/onboarding";
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}
