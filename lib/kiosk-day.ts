import type { KioskDestinationId } from "./kiosk";

export const kioskDayTaskIcons = [
  "check",
  "sparkles",
  "sprayCan",
  "trash",
  "thermometer",
  "refrigerator",
  "snowflake",
  "flame",
  "cookingPot",
  "utensils",
  "coffee",
  "droplets",
  "wind",
  "lightbulb",
  "power",
  "banknote",
  "package",
  "clipboard",
  "doorClosed",
  "lock",
  "key",
] as const;

export type KioskDayTaskIcon = (typeof kioskDayTaskIcons)[number];

export type KioskDayTask = {
  title: string;
  description?: string;
  icon?: KioskDayTaskIcon;
  link?: KioskDestinationId;
};
