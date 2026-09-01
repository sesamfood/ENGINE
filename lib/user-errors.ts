import { ConvexError } from "convex/values";

const defaultFallback = "Handlingen kunne ikke gennemføres. Prøv igen.";

const danishWordPattern =
  /\b(?:adgang|allerede|angiv|blev|bruger|dato|den|der|det|din|du|en|er|et|fejl|fil|for|forbindelsen|har|ikke|indlæs|kan|kunne|lokation|mangler|med|må|og|opret|organisation|produkt|prøv|skal|til|ugyldig|vælg)\b|[æøå]/i;

const technicalMessagePattern =
  /\[CONVEX\b|called by client|server error|uncaught (?:error|convexerror)|internal server error|unexpected server error|request id|stack trace|traceback|invalid arguments? for|argumentvalidationerror|could not find public function|function .+ not found|websocket|\b(?:type|range|syntax|reference)?error:|\bat .+\(.+:[0-9]+:[0-9]+\)/i;

function messageFromConvexData(data: unknown) {
  if (typeof data === "string") return data.trim();

  if (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    typeof data.code === "string"
  ) {
    if (data.code === "forbidden" || data.code === "location_forbidden") {
      return "Du har ikke adgang til handlingen";
    }
  }

  return null;
}

function messageFromConvexError(error: unknown) {
  if (error instanceof ConvexError) {
    return messageFromConvexData(error.data);
  }

  if (typeof error !== "object" || error === null || !("data" in error)) {
    return null;
  }

  const identifyingField = Symbol.for("ConvexError");
  if (!(identifyingField in error) || error[identifyingField] !== true) {
    return null;
  }

  return messageFromConvexData(error.data);
}

function messageFromUnknownError(error: unknown) {
  if (error instanceof Error) return error.message.trim();
  if (typeof error === "string") return error.trim();
  return null;
}

function knownUserMessage(message: string) {
  const normalized = message.toLocaleLowerCase("da-DK");

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network request failed") ||
    normalized === "load failed" ||
    normalized.includes("connection lost") ||
    normalized.includes("websocket")
  ) {
    return "Forbindelsen til serveren blev afbrudt. Kontrollér internetforbindelsen, og prøv igen.";
  }

  if (
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("deadline exceeded")
  ) {
    return "Serveren svarede ikke i tide. Prøv igen om lidt.";
  }

  if (
    normalized === "du er ikke logget ind" ||
    normalized === "unauthenticated" ||
    normalized === "not authenticated" ||
    normalized.includes("sessionen er udløbet") ||
    normalized.includes("session expired")
  ) {
    return "Din session er udløbet. Log ind igen.";
  }

  if (normalized === "ingen aktiv organisation") {
    return "Der er ikke valgt en aktiv organisation. Genindlæs siden, eller log ind igen.";
  }

  if (normalized.startsWith("du har ikke adgang")) {
    const detail = message.replace(/[.!?]+$/, "");
    return `${detail}. Kontakt en Administrator, hvis du mener, det er en fejl.`;
  }

  if (normalized === "forbidden" || normalized === "permission denied") {
    return "Du har ikke adgang til handlingen. Kontakt en Administrator, hvis du mener, det er en fejl.";
  }

  if (
    normalized.includes("too many requests") ||
    normalized.includes("rate limit") ||
    /\b429\b/.test(normalized)
  ) {
    return "Der er sendt for mange anmodninger. Vent et øjeblik, og prøv igen.";
  }

  return null;
}

function isDisplaySafe(message: string) {
  return (
    message.length > 0 &&
    message.length <= 500 &&
    !message.includes("\n") &&
    !technicalMessagePattern.test(message)
  );
}

function isSafeLocalUserMessage(message: string) {
  if (!isDisplaySafe(message)) return false;
  if (/[æøå]/i.test(message)) return true;
  return (message.match(new RegExp(danishWordPattern, "gi"))?.length ?? 0) >= 2;
}

export function getUserErrorMessage(
  error: unknown,
  fallback = defaultFallback,
) {
  const convexMessage = messageFromConvexError(error);
  if (convexMessage) {
    const knownMessage = knownUserMessage(convexMessage);
    if (knownMessage) return knownMessage;
    return isDisplaySafe(convexMessage) ? convexMessage : fallback;
  }

  const message = messageFromUnknownError(error);

  if (!message) return fallback;

  const knownMessage = knownUserMessage(message);
  if (knownMessage) return knownMessage;

  return isSafeLocalUserMessage(message) ? message : fallback;
}
