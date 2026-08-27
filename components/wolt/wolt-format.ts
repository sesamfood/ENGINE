import type { WoltOrderStatus, WoltOrderType } from "./wolt-types";

const dateTimeFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
});

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
});

export const woltStatusLabels: Record<WoltOrderStatus, string> = {
  created: "Modtaget",
  production: "I produktion",
  ready: "Klar",
  delivered: "Leveret",
  canceled: "Annulleret",
  other: "Anden status",
};

export const woltOrderTypeLabels: Record<WoltOrderType, string> = {
  instant: "Straksordre",
  preorder: "Forudbestilling",
  other: "Anden type",
};

export function formatWoltDateTime(value: number) {
  return dateTimeFormatter.format(value);
}

export function formatWoltDate(value: number) {
  return dateFormatter.format(value);
}

export function formatWoltMoney(minorUnits: number, currency: string) {
  try {
    const formatter = new Intl.NumberFormat("da-DK", {
      style: "currency",
      currency,
    });
    const fractionDigits =
      formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(minorUnits / 10 ** fractionDigits);
  } catch {
    return `${minorUnits.toLocaleString("da-DK")} ${currency}`;
  }
}

export function woltStatusVariant(
  status: WoltOrderStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "delivered":
    case "ready":
      return "default";
    case "canceled":
      return "destructive";
    case "created":
    case "production":
      return "secondary";
    case "other":
      return "outline";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function woltHealthLabel(
  state: "ready" | "disabled" | "reauthorizationRequired" | "error",
) {
  switch (state) {
    case "ready":
      return "Klar";
    case "disabled":
      return "Afbrudt";
    case "reauthorizationRequired":
      return "Godkendelse kræves";
    case "error":
      return "Fejl";
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

export function woltHealthVariant(
  state: "ready" | "disabled" | "reauthorizationRequired" | "error",
): "default" | "secondary" | "destructive" | "outline" {
  switch (state) {
    case "ready":
      return "default";
    case "error":
      return "destructive";
    case "reauthorizationRequired":
      return "outline";
    case "disabled":
      return "secondary";
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
