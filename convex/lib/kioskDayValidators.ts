import { v } from "convex/values";
import { kioskDestinations } from "../../lib/kiosk";
import { kioskDayTaskIcons } from "../../lib/kiosk-day";

export const kioskDayTaskValidator = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  icon: v.optional(v.union(...kioskDayTaskIcons.map((icon) => v.literal(icon)))),
  link: v.optional(v.union(...kioskDestinations.map((page) => v.literal(page.id)))),
});
