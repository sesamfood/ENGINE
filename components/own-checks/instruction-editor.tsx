"use client";

import { BoldIcon, ItalicIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FieldDescription, FieldError } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { encodeInstructions, instructionText, MAX_INSTRUCTION_LENGTH, type InstructionRun } from "@/lib/own-check-instructions";
import { InstructionContent } from "./instruction-content";

function readInstructions(editor: HTMLElement): InstructionRun[] {
  const runs: InstructionRun[] = [];
  function isBlock(node: Node) {
    return node instanceof HTMLElement && ["DIV", "P", "LI"].includes(node.tagName);
  }
  function isPlaceholderBreak(node: Node): boolean {
    if (node.nextSibling) return false;
    const parent = node.parentNode;
    return !parent || parent === editor || isBlock(parent) || isPlaceholderBreak(parent);
  }
  function visit(node: Node, bold = false, italic = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      runs.push({ text: node.textContent ?? "", bold, italic });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      if (!isPlaceholderBreak(node)) runs.push({ text: "\n" });
      return;
    }
    const block = isBlock(node);
    if (block && node.previousSibling) runs.push({ text: "\n" });
    const weight = node.style.fontWeight;
    const isBold = weight ? weight === "bold" || Number(weight) >= 600 : bold || ["B", "STRONG"].includes(node.tagName);
    const isItalic = node.style.fontStyle ? node.style.fontStyle === "italic" : italic || ["I", "EM"].includes(node.tagName);
    for (const child of node.childNodes) visit(child, isBold, isItalic);
    if (block && node.nextSibling && !isBlock(node.nextSibling)) runs.push({ text: "\n" });
  }
  for (const node of editor.childNodes) visit(node);
  return runs;
}

export function InstructionEditor({ id, defaultValue, onChange }: {
  id: string;
  defaultValue: string;
  onChange: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  // Keep React out of the browser's editable DOM so typing and undo retain the caret.
  const [initialContent] = useState(() => <InstructionContent value={defaultValue} />);
  const [length, setLength] = useState(() => instructionText(defaultValue).length);
  const [formats, setFormats] = useState<string[]>([]);
  const tooLong = length > MAX_INSTRUCTION_LENGTH;

  function rememberSelection() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editorRef.current?.contains(selection.anchorNode) || !editorRef.current.contains(selection.focusNode)) return;
    selectionRef.current = selection.getRangeAt(0).cloneRange();
    const next = ["bold", "italic"].filter((format) => document.queryCommandState(format));
    setFormats((current) => current.join() === next.join() ? current : next);
  }

  useEffect(() => {
    document.addEventListener("selectionchange", rememberSelection);
    return () => document.removeEventListener("selectionchange", rememberSelection);
  }, []);

  function change() {
    if (!editorRef.current) return;
    const runs = readInstructions(editorRef.current);
    setLength(runs.reduce((total, run) => total + run.text.length, 0));
    onChange(encodeInstructions(runs));
    rememberSelection();
  }

  function format(command: "bold" | "italic") {
    const editor = editorRef.current;
    if (!editor) return;
    rememberSelection();
    editor.focus();
    const selection = window.getSelection();
    if (selection && selectionRef.current && editor.contains(selectionRef.current.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(selectionRef.current);
    }
    document.execCommand(command);
    change();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <div className="flex items-center justify-between gap-2 border-b p-1">
          <ToggleGroup multiple value={formats} aria-label="Tekstformatering" onValueChange={(next) => {
            const command = (["bold", "italic"] as const).find((item) => next.includes(item) !== formats.includes(item));
            if (command) format(command);
          }}>
            <ToggleGroupItem value="bold" aria-label="Fed" aria-keyshortcuts="Control+b Meta+b" onMouseDown={(event) => event.preventDefault()}><BoldIcon />Fed</ToggleGroupItem>
            <ToggleGroupItem value="italic" aria-label="Kursiv" aria-keyshortcuts="Control+i Meta+i" onMouseDown={(event) => event.preventDefault()}><ItalicIcon />Kursiv</ToggleGroupItem>
          </ToggleGroup>
          <HelpTooltip label="tekstformatering" content="Fed: Ctrl/Cmd+B. Kursiv: Ctrl/Cmd+I." />
        </div>
        <div
          ref={editorRef}
          id={id}
          role="textbox"
          aria-label="Instruktioner"
          aria-multiline="true"
          aria-invalid={tooLong}
          aria-describedby={`${id}-length`}
          contentEditable
          suppressContentEditableWarning
          className="min-h-32 px-2.5 py-2 whitespace-pre-wrap break-words outline-none"
          onInput={change}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && !event.nativeEvent.isComposing && ["b", "i"].includes(event.key.toLowerCase())) {
              event.preventDefault();
              format(event.key.toLowerCase() === "b" ? "bold" : "italic");
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
            change();
          }}
          onDrop={(event) => event.preventDefault()}
        >{initialContent}</div>
      </div>
      {tooLong ? <FieldError id={`${id}-length`}>Instruktionerne må højst være 4.000 tegn.</FieldError> : <FieldDescription id={`${id}-length`}>{length.toLocaleString("da-DK")} / 4.000 tegn</FieldDescription>}
    </div>
  );
}
