import { parseDateKey, addDays as addDateKey, zonedTimestamp, daysBetween as dateDifference } from "./date";
export { addDays as addDateKey, dateKey as dateKeyInZone, zonedTimestamp } from "./date";

export const MAX_RANGE_DAYS = 366;
export const MAX_OCCURRENCES = 20_000;

const DEFAULT_DUE_MINUTE = 23 * 60 + 59;

export type OwnCheckControlType =
  | "temperature"
  | "cleaning"
  | "receiving"
  | "shelfLife"
  | "hygiene"
  | "pest"
  | "other";

export type OwnCheckSchedule =
  | { type: "daily" }
  | { type: "weekly"; weekdays: number[] }
  | { type: "monthly"; days: number[] }
  | { type: "interval"; intervalDays: number; anchorDate: string };

export type OwnCheckField =
  | {
      key: string;
      label: string;
      type: "number";
      required: boolean;
      unit?: string;
      min?: number;
      max?: number;
      decimals?: number;
    }
  | {
      key: string;
      label: string;
      type: "checkbox";
      required: boolean;
      mustBeChecked: boolean;
    }
  | {
      key: string;
      label: string;
      type: "choice";
      required: boolean;
      options: Array<{ value: string; label: string; compliant: boolean }>;
    }
  | {
      key: string;
      label: string;
      type: "text";
      required: boolean;
      maxLength?: number;
    }
  | {
      key: string;
      label: string;
      type: "attachment";
      required: boolean;
      maxFiles: number;
    };

export type OwnCheckValue =
  | { key: string; type: "number"; number: number }
  | { key: string; type: "checkbox"; checked: boolean }
  | { key: string; type: "choice"; value: string }
  | { key: string; type: "text"; text: string }
  | { key: string; type: "attachment"; storageIds: string[] };

export type OwnCheckTemplateVersionInput = {
  templateId: string;
  templateVersionId: string;
  templateVersion: number;
  name: string;
  controlType: OwnCheckControlType;
  schedule: OwnCheckSchedule;
  startMinuteOfDay?: number;
  dueMinuteOfDay?: number;
  fields?: OwnCheckField[];
  description?: string;
  allLocations: boolean;
  locationIds: string[];
  responsibleRole?: string;
  validFrom: number;
  validTo?: number;
};

export type OwnCheckOccurrence = {
  templateId: string;
  templateVersionId: string;
  templateVersion: number;
  name: string;
  controlType: OwnCheckControlType;
  dueDateKey: string;
  startsAt: number | null;
  dueAt: number;
};

export type OwnCheckStatus = "notCompleted" | "completed" | "approved" | "deviation";

function weekdayFor(dateKey: string) {
  return parseDateKey(dateKey).getUTCDay();
}

function daysInMonth(dateKey: string) {
  const date = parseDateKey(dateKey);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function scheduleMatches(schedule: OwnCheckSchedule, dateKey: string) {
  if (schedule.type === "daily") return true;
  if (schedule.type === "weekly") return schedule.weekdays.includes(weekdayFor(dateKey));
  if (schedule.type === "monthly") {
    const day = parseDateKey(dateKey).getUTCDate();
    return schedule.days.some((scheduledDay) =>
      scheduledDay === 0 ? day === daysInMonth(dateKey) : scheduledDay === day,
    );
  }
  const days = dateDifference(schedule.anchorDate, dateKey);
  return days >= 0 && days % schedule.intervalDays === 0;
}

function locationMatches(version: OwnCheckTemplateVersionInput, locationId: string) {
  return version.allLocations || version.locationIds.includes(locationId);
}

function validAt(version: OwnCheckTemplateVersionInput, dueAt: number) {
  return version.validFrom <= dueAt && (version.validTo === undefined || dueAt < version.validTo);
}

export function expandOccurrences(input: {
  versions: OwnCheckTemplateVersionInput[];
  locationId: string;
  fromDateKey: string;
  toDateKey: string;
  timeZone: string;
}): OwnCheckOccurrence[] {
  const rangeDays = dateDifference(input.fromDateKey, input.toDateKey);
  if (rangeDays < 0) throw new Error("Datointervallet er ugyldigt");
  if (rangeDays + 1 > MAX_RANGE_DAYS) throw new Error("Datointervallet er for langt");

  const grouped = new Map<string, OwnCheckTemplateVersionInput[]>();
  for (const version of input.versions) {
    if (!locationMatches(version, input.locationId)) continue;
    const list = grouped.get(version.templateId) ?? [];
    list.push(version);
    grouped.set(version.templateId, list);
  }
  for (const versions of grouped.values()) {
    versions.sort((a, b) => b.validFrom - a.validFrom || b.templateVersion - a.templateVersion);
  }

  const occurrences: OwnCheckOccurrence[] = [];
  for (let offset = 0; offset <= rangeDays; offset += 1) {
    const dateKey = addDateKey(input.fromDateKey, offset);
    for (const versions of grouped.values()) {
      for (const version of versions) {
        if (!scheduleMatches(version.schedule, dateKey)) continue;
        const dueAt = zonedTimestamp(
          dateKey,
          version.dueMinuteOfDay ?? DEFAULT_DUE_MINUTE,
          input.timeZone,
        );
        if (!validAt(version, dueAt)) continue;
        const startsAt = version.startMinuteOfDay === undefined
          ? null
          : zonedTimestamp(dateKey, version.startMinuteOfDay, input.timeZone);
        occurrences.push({
          templateId: version.templateId,
          templateVersionId: version.templateVersionId,
          templateVersion: version.templateVersion,
          name: version.name,
          controlType: version.controlType,
          dueDateKey: dateKey,
          startsAt,
          dueAt,
        });
        break;
      }
    }
    if (occurrences.length > MAX_OCCURRENCES) {
      throw new Error("Der er for mange egenkontroller i perioden");
    }
  }

  return occurrences.sort(
    (a, b) => a.dueAt - b.dueAt || a.templateId.localeCompare(b.templateId),
  );
}

function numberText(value: number, decimals?: number) {
  const rendered = decimals === undefined ? String(value) : value.toFixed(decimals);
  return rendered.replace(".", ",");
}

function withUnit(value: string, unit?: string) {
  return unit ? `${value} ${unit}` : value;
}

export function evaluateCompliance(fields: OwnCheckField[], values: OwnCheckValue[]) {
  const byKey = new Map(values.map((value) => [value.key, value]));
  const violations: Array<{ key: string; label: string; message: string }> = [];
  const addViolation = (field: OwnCheckField, message: string) => {
    violations.push({ key: field.key, label: field.label, message });
  };

  for (const field of fields) {
    const value = byKey.get(field.key);
    if (!value) {
      if (field.required) addViolation(field, "Feltet skal udfyldes");
      continue;
    }
    if (value.type !== field.type) {
      addViolation(field, "Feltet har en ugyldig værdi");
      continue;
    }

    if (field.type === "number") {
      const numberValue = value as Extract<OwnCheckValue, { type: "number" }>;
      if (!Number.isFinite(numberValue.number)) {
        addViolation(field, "Målingen skal være et tal");
        continue;
      }
      const rendered = withUnit(numberText(numberValue.number, field.decimals), field.unit);
      if (field.min !== undefined && numberValue.number < field.min) {
        const limit = withUnit(numberText(field.min, field.decimals), field.unit);
        addViolation(field, `Målingen ${rendered} er under grænsen ${limit}`);
      } else if (field.max !== undefined && numberValue.number > field.max) {
        const limit = withUnit(numberText(field.max, field.decimals), field.unit);
        addViolation(field, `Målingen ${rendered} overskrider grænsen ${limit}`);
      }
    } else if (field.type === "checkbox") {
      const checkboxValue = value as Extract<OwnCheckValue, { type: "checkbox" }>;
      if (field.mustBeChecked && !checkboxValue.checked) addViolation(field, "Punktet skal bekræftes");
    } else if (field.type === "choice") {
      const choiceValue = value as Extract<OwnCheckValue, { type: "choice" }>;
      const option = field.options.find((candidate) => candidate.value === choiceValue.value);
      if (!option) addViolation(field, "Vælg en gyldig mulighed");
      else if (!option.compliant) addViolation(field, "Valget er ikke i orden");
    } else if (field.type === "text") {
      const textValue = value as Extract<OwnCheckValue, { type: "text" }>;
      if (field.required && !textValue.text.trim()) addViolation(field, "Feltet skal udfyldes");
      if (field.maxLength !== undefined && textValue.text.length > field.maxLength) {
        addViolation(field, `Feltet må højst indeholde ${field.maxLength} tegn`);
      }
    } else if (field.required && (value as Extract<OwnCheckValue, { type: "attachment" }>).storageIds.length === 0) {
      addViolation(field, "Tilføj mindst én fil");
    } else if ((value as Extract<OwnCheckValue, { type: "attachment" }>).storageIds.length > field.maxFiles) {
      addViolation(field, `Feltet må højst have ${field.maxFiles} filer`);
    }
  }

  return { compliant: violations.length === 0, violations };
}

export function ownCheckStatus(
  entry: { status: "completed" | "deviation" | "approved"; hasDeviation: boolean; followUp: "none" | "open" | "resolved" } | null,
): OwnCheckStatus {
  if (!entry) return "notCompleted";
  if (entry.status === "approved") return "approved";
  if (entry.status === "deviation" || entry.hasDeviation || entry.followUp === "open") {
    return "deviation";
  }
  return "completed";
}

export const ownCheckStatusLabels: Record<OwnCheckStatus, string> = {
  notCompleted: "Ikke udført",
  completed: "Udført",
  approved: "Godkendt",
  deviation: "Afvigelse",
};

export const ownCheckControlTypeLabels: Record<OwnCheckControlType, string> = {
  temperature: "Temperatur",
  cleaning: "Rengøring",
  receiving: "Modtagekontrol",
  shelfLife: "Holdbarhed",
  hygiene: "Personlig hygiejne",
  pest: "Skadedyr",
  other: "Andet",
};

export function isOverdue(occurrence: OwnCheckOccurrence, now: number) {
  return now > occurrence.dueAt;
}

export function formatValue(field: OwnCheckField, value: OwnCheckValue | undefined) {
  if (!value) return "Ikke udfyldt";
  if (field.type !== value.type) return "Ugyldig værdi";
  if (field.type === "number") return withUnit(numberText((value as Extract<OwnCheckValue, { type: "number" }>).number, field.decimals), field.unit);
  if (field.type === "checkbox") return (value as Extract<OwnCheckValue, { type: "checkbox" }>).checked ? "Ja" : "Nej";
  if (field.type === "choice") {
    const choiceValue = value as Extract<OwnCheckValue, { type: "choice" }>;
    return field.options.find((option) => option.value === choiceValue.value)?.label ?? choiceValue.value;
  }
  if (field.type === "text") return (value as Extract<OwnCheckValue, { type: "text" }>).text || "Ikke udfyldt";
  const attachmentValue = value as Extract<OwnCheckValue, { type: "attachment" }>;
  return attachmentValue.storageIds.length === 1
    ? "1 fil"
    : `${attachmentValue.storageIds.length} filer`;
}
