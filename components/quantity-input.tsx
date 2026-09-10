"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

export function QuantityInput({
  id,
  label,
  value,
  onValueChange,
  min = 0,
  max,
  step = 1,
  integer = false,
  disabled = false,
  invalid = false,
  className,
}: {
  id?: string;
  label: string;
  value: string | number;
  onValueChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayedValue = typeof value === "number" ? (draft ?? value) : value;
  const normalized = String(displayedValue).trim().replace(",", ".");
  const parsed = Number(normalized);
  const quantity = normalized && Number.isFinite(parsed) ? parsed : null;
  function adjust(change: number) {
    const next = Math.min(
      max ?? Infinity,
      Math.max(min, (quantity ?? 0) + change),
    );
    setDraft(null);
    onValueChange(String(Math.round(next * 1e6) / 1e6));
  }
  return (
    <InputGroup className={cn("h-11", className)}>
      <InputGroupInput
        id={id}
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        value={displayedValue}
        aria-label={label}
        aria-invalid={invalid}
        disabled={disabled}
        className="text-center tabular-nums"
        onFocus={() => {
          if (typeof value === "number") setDraft(String(value));
        }}
        onBlur={() => setDraft(null)}
        onChange={(event) => {
          if (typeof value === "number") setDraft(event.target.value);
          onValueChange(event.target.value);
        }}
      />
      <InputGroupAddon align="inline-start">
        <InputGroupButton
          size="icon-sm"
          className="size-10"
          aria-label={`Reducér ${label.toLocaleLowerCase("da")}`}
          disabled={disabled || (quantity !== null && quantity <= min)}
          onClick={() => adjust(-step)}
        >
          <MinusIcon data-icon="inline-start" />
        </InputGroupButton>
      </InputGroupAddon>
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-sm"
          className="size-10"
          aria-label={`Øg ${label.toLocaleLowerCase("da")}`}
          disabled={
            disabled ||
            (max !== undefined && quantity !== null && quantity >= max)
          }
          onClick={() => adjust(step)}
        >
          <PlusIcon data-icon="inline-start" />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
