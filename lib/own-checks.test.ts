import { describe, expect, it } from "vitest";
import {
  addDateKey,
  dateKeyInZone,
  evaluateCompliance,
  expandOccurrences,
  ownCheckControlTypeLabels,
  ownCheckStatus,
  zonedTimestamp,
} from "./own-checks";
import { isDocumentationReportReady } from "./own-check-documentation";

const baseVersion = {
  templateId: "template",
  templateVersionId: "version-1",
  templateVersion: 1,
  name: "Kølekontrol",
  controlType: "temperature" as const,
  schedule: { type: "daily" } as const,
  allLocations: true,
  locationIds: [],
  validFrom: 0,
};

describe("egenkontrolplaner", () => {
  it("holder lokal dato over sommertidsskift", () => {
    const before = zonedTimestamp("2026-03-29", 23 * 60 + 59, "Europe/Copenhagen");
    const after = zonedTimestamp("2026-10-25", 23 * 60 + 59, "Europe/Copenhagen");
    expect(before).toBe(Date.parse("2026-03-29T21:59:00Z"));
    expect(after).toBe(Date.parse("2026-10-25T22:59:00Z"));
    expect(dateKeyInZone(before, "Europe/Copenhagen")).toBe("2026-03-29");
    expect(dateKeyInZone(after, "Europe/Copenhagen")).toBe("2026-10-25");
  });

  it("udvider faste intervaller fra den lokale ank dato", () => {
    const occurrences = expandOccurrences({
      versions: [{ ...baseVersion, schedule: { type: "interval", intervalDays: 2, anchorDate: "2026-03-28" } }],
      locationId: "location",
      fromDateKey: "2026-03-28",
      toDateKey: "2026-04-02",
      timeZone: "Europe/Copenhagen",
    });
    expect(occurrences.map((item) => item.dueDateKey)).toEqual(["2026-03-28", "2026-03-30", "2026-04-01"]);
  });

  it("udvider månedens sidste dag", () => {
    const occurrences = expandOccurrences({
      versions: [{ ...baseVersion, schedule: { type: "monthly", days: [0] } }],
      locationId: "location",
      fromDateKey: "2026-02-27",
      toDateKey: "2026-03-01",
      timeZone: "Europe/Copenhagen",
    });
    expect(occurrences.map((item) => item.dueDateKey)).toEqual(["2026-02-28"]);
  });

  it("vælger versioner efter deres gyldighed på forfaldstidspunktet", () => {
    const occurrences = expandOccurrences({
      versions: [
        { ...baseVersion, validTo: Date.parse("2026-08-03T22:00:00Z") },
        {
          ...baseVersion,
          templateVersionId: "version-2",
          templateVersion: 2,
          name: "Ny kølekontrol",
          validFrom: Date.parse("2026-08-03T22:00:00Z"),
        },
      ],
      locationId: "location",
      fromDateKey: "2026-08-03",
      toDateKey: "2026-08-04",
      timeZone: "Europe/Copenhagen",
    });
    expect(occurrences.map((item) => item.templateVersionId)).toEqual([
      "version-1",
      "version-2",
    ]);
  });

  it("respekterer lokationsændringer i en version", () => {
    const occurrences = expandOccurrences({
      versions: [
        { ...baseVersion, locationIds: ["location"], allLocations: false, validTo: Date.parse("2026-08-02T00:00:00Z") },
        { ...baseVersion, templateVersionId: "version-2", templateVersion: 2, locationIds: [], allLocations: false, validFrom: Date.parse("2026-08-02T00:00:00Z") },
      ],
      locationId: "location",
      fromDateKey: "2026-08-01",
      toDateKey: "2026-08-03",
      timeZone: "Europe/Copenhagen",
    });
    expect(occurrences.map((item) => item.dueDateKey)).toEqual(["2026-08-01"]);
  });

  it("evaluerer grænser og kontrolfelter", () => {
    const fields = [
      { key: "temperature", label: "Temperatur", type: "number" as const, required: true, min: 0, max: 5, unit: "°C" },
      { key: "clean", label: "Rengøring", type: "checkbox" as const, required: true, mustBeChecked: true },
      { key: "choice", label: "Valg", type: "choice" as const, required: true, options: [{ value: "bad", label: "Ikke i orden", compliant: false }, { value: "ok", label: "I orden", compliant: true }] },
    ];
    expect(evaluateCompliance(fields, [
      { key: "temperature", type: "number", number: 5 },
      { key: "clean", type: "checkbox", checked: true },
      { key: "choice", type: "choice", value: "ok" },
    ]).compliant).toBe(true);
    const result = evaluateCompliance(fields, [
      { key: "temperature", type: "number", number: 6 },
      { key: "clean", type: "checkbox", checked: false },
      { key: "choice", type: "choice", value: "bad" },
    ]);
    expect(result.compliant).toBe(false);
    expect(result.violations).toHaveLength(3);
    expect(evaluateCompliance(fields, []).violations).toContainEqual({ key: "temperature", label: "Temperatur", message: "Feltet skal udfyldes" });
  });

  it("har danske labels og status", () => {
    expect(ownCheckControlTypeLabels.temperature).toBe("Temperatur");
    expect(ownCheckStatus(null)).toBe("notCompleted");
    expect(ownCheckStatus({ status: "approved", hasDeviation: true, followUp: "resolved" })).toBe("approved");
    expect(addDateKey("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("afviser rapporter med afgrænsede data", () => {
    expect(isDocumentationReportReady({ entriesExhausted: true, entriesTruncated: false, prepared: true, missingTruncated: false })).toBe(true);
    expect(isDocumentationReportReady({ entriesExhausted: true, entriesTruncated: false, prepared: true, missingTruncated: true })).toBe(false);
    expect(isDocumentationReportReady({ entriesExhausted: false, entriesTruncated: false, prepared: true, missingTruncated: false })).toBe(false);
  });
});
