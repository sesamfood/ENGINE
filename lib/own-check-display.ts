import type { OwnCheckField } from "./own-checks";

export function ownCheckLimitText(
  field: OwnCheckField,
  mode: "summary" | "guidance" = "summary",
) {
  const empty = mode === "guidance" ? "" : "Ingen fast grænse";
  if (field.type !== "number") return empty;
  const number = (value: number) => String(value).replace(".", ",");
  const unit = field.unit ? ` ${field.unit}` : "";
  if (field.min !== undefined && field.max !== undefined) {
    return mode === "guidance"
      ? `Skal være mellem ${number(field.min)} og ${number(field.max)}${unit}`
      : `${number(field.min)}–${number(field.max)}${unit}`;
  }
  if (field.min !== undefined)
    return `${mode === "guidance" ? "Skal være mindst" : "Mindst"} ${number(field.min)}${unit}`;
  if (field.max !== undefined)
    return `${mode === "guidance" ? "Må højst være" : "Højst"} ${number(field.max)}${unit}`;
  return mode === "guidance" && field.unit ? `Enhed: ${field.unit}` : empty;
}
