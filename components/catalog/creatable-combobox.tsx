"use client";

import { PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export type ComboboxOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function CreatableCombobox({
  options,
  value,
  onValueChange,
  onInputValueChange,
  placeholder,
  allowCreate = false,
  disabled = false,
  ariaLabel,
}: {
  options: ComboboxOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  onInputValueChange?: (value: string) => void;
  placeholder: string;
  allowCreate?: boolean;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const selectedLabel =
    options.find((option) => option.value === value)?.label ??
    (value?.startsWith("new:") ? value.slice(4) : "");
  const selectionKey = `${value ?? ""}:${selectedLabel}`;
  const [inputState, setInputState] = useState({
    selectionKey,
    value: selectedLabel,
  });
  const [open, setOpen] = useState(false);
  const [highlightedValue, setHighlightedValue] = useState<string>();
  const inputValue =
    inputState.selectionKey === selectionKey ? inputState.value : selectedLabel;

  const visibleOptions = useMemo(() => {
    const query = inputValue.trim().toLocaleLowerCase("da");
    const matches = query
      ? options.filter((option) =>
          option.label.toLocaleLowerCase("da").includes(query),
        )
      : options;
    const exactMatch = options.some(
      (option) => option.label.toLocaleLowerCase("da") === query,
    );
    if (allowCreate && query && !exactMatch) {
      return [
        ...matches,
        { value: `new:${inputValue.trim()}`, label: inputValue.trim() },
      ];
    }
    return matches;
  }, [allowCreate, inputValue, options]);

  const itemValues = visibleOptions.map((option) => option.value);

  function commitInput() {
    const label = inputValue.trim();
    if (!label) return false;

    const existing = options.find(
      (option) =>
        option.label.toLocaleLowerCase("da") ===
        label.toLocaleLowerCase("da"),
    );
    const nextValue = existing?.value ?? (allowCreate ? `new:${label}` : null);
    if (!nextValue) return false;

    const nextLabel = existing?.label ?? label;
    onValueChange(nextValue);
    setInputState({
      selectionKey: `${nextValue}:${nextLabel}`,
      value: nextLabel,
    });
    setHighlightedValue(undefined);
    setOpen(false);
    return true;
  }

  return (
    <Combobox
      items={itemValues}
      filteredItems={itemValues}
      value={value}
      inputValue={inputValue}
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (
          !nextOpen &&
          (eventDetails.reason === "outside-press" ||
            eventDetails.reason === "focus-out")
        ) {
          commitInput();
        }
        setOpen(nextOpen);
      }}
      onItemHighlighted={(nextValue) => setHighlightedValue(nextValue)}
      onInputValueChange={(nextValue) => {
        setInputState({ selectionKey, value: nextValue });
        setHighlightedValue(undefined);
        onInputValueChange?.(nextValue);
        if (!nextValue) onValueChange(null);
      }}
      onValueChange={(nextValue) => {
        onValueChange(nextValue);
        setHighlightedValue(undefined);
        setOpen(false);
        const label = visibleOptions.find(
          (option) => option.value === nextValue,
        )?.label;
        if (label) {
          setInputState({
            selectionKey: `${nextValue ?? ""}:${label}`,
            value: label,
          });
        }
      }}
      disabled={disabled}
      itemToStringLabel={(itemValue) =>
        visibleOptions.find((option) => option.value === itemValue)?.label ?? ""
      }
    >
      <ComboboxInput
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-11 w-full"
        showClear
        disabled={disabled}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.nativeEvent.isComposing &&
            highlightedValue === undefined &&
            commitInput()
          ) {
            event.preventDefault();
          }
          if (event.key === "Tab" && !event.shiftKey) commitInput();
        }}
      />
      <ComboboxContent>
        <ComboboxEmpty>Ingen resultater fundet.</ComboboxEmpty>
        <ComboboxList>
          {visibleOptions.map((option) => (
            <ComboboxItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className="min-h-10"
            >
              {option.value.startsWith("new:") ? (
                <PlusIcon aria-hidden="true" />
              ) : null}
              {option.value.startsWith("new:")
                ? `Opret “${option.label}”`
                : option.label}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
