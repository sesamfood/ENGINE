import { Fragment } from "react";
import { decodeInstructions } from "@/lib/own-check-instructions";

export function InstructionContent({ value }: { value: string }) {
  return decodeInstructions(value).map((run, index) => {
    const content = run.italic ? <em>{run.text}</em> : run.text;
    return <Fragment key={index}>{run.bold ? <strong>{content}</strong> : content}</Fragment>;
  });
}
