import { describe, expect, it } from "vitest";
import { sanitizePdfText } from "./own-check-pdf";

describe("PDF-tekst", () => {
  it("bevarer danske tegn og erstatter tegn uden for WinAnsi", () => {
    expect(sanitizePdfText("Køkken – åbningstid 🙂")).toBe("Køkken – åbningstid ?");
  });
});
