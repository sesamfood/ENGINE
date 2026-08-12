import { describe, expect, it } from "vitest";
import { pdfLimitText, pdfRevisionChanges, sanitizePdfText } from "./own-check-pdf";

describe("PDF-tekst", () => {
  it("bevarer danske tegn og erstatter tegn uden for WinAnsi", () => {
    expect(sanitizePdfText("Køkken – åbningstid 🙂")).toBe("Køkken – åbningstid ?");
  });

  it("bruger WinAnsi-sikre symboler i applikationens PDF-tekst", () => {
    expect(sanitizePdfText(pdfLimitText({ key: "temperature", label: "Temperatur", type: "number", required: true, min: 0 }))).toBe("Mindst 0");
    expect(sanitizePdfText(pdfRevisionChanges([{ label: "Temperatur", from: "2", to: "3" }]))).toBe("Temperatur: 2 -> 3");
  });
});
