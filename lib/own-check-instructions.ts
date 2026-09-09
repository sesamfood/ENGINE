export const MAX_INSTRUCTION_LENGTH = 4_000;

const richTextPrefix = "own-check-rich-text:v1:";

export type InstructionRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
};

function isInstructionRun(value: unknown): value is InstructionRun {
  return typeof value === "object" && value !== null &&
    "text" in value && typeof value.text === "string" &&
    (!("bold" in value) || typeof value.bold === "boolean") &&
    (!("italic" in value) || typeof value.italic === "boolean");
}

export function decodeInstructions(value: string): InstructionRun[] {
  if (value.startsWith(richTextPrefix)) {
    try {
      const runs: unknown = JSON.parse(value.slice(richTextPrefix.length));
      if (Array.isArray(runs) && runs.every(isInstructionRun)) return runs;
    } catch {
      // Unrecognized content remains literal text, including older instructions.
    }
  }
  return [{ text: value }];
}

export function encodeInstructions(runs: InstructionRun[]): string {
  const merged: InstructionRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const previous = merged.at(-1);
    if (previous && Boolean(previous.bold) === Boolean(run.bold) && Boolean(previous.italic) === Boolean(run.italic)) {
      previous.text += run.text;
    } else {
      merged.push({ text: run.text, ...(run.bold ? { bold: true } : {}), ...(run.italic ? { italic: true } : {}) });
    }
  }
  const text = merged.map((run) => run.text).join("");
  if (!text.trim()) return "";
  if (!merged.some((run) => run.bold || run.italic) && !text.startsWith(richTextPrefix)) return text;
  return richTextPrefix + JSON.stringify(merged);
}

export function instructionText(value: string): string {
  return decodeInstructions(value).map((run) => run.text).join("");
}
