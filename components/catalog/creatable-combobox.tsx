"use client";

import { FolderIcon, PlusIcon } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";

export type ComboboxOption = {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
  groupDepth?: number;
  groupLabel?: string;
  searchText?: string;
};

export type ComboboxOptionGroup = {
  value: string;
  label: string;
  title?: string;
  depth: number;
  optionValues: string[];
};

const GROUP_SELECTION_PREFIX = "__combobox_group__:";
const SUGGESTION_SELECTION_PREFIX = "__combobox_suggestion__:";

function groupSelectionValue(group: string) {
  return `${GROUP_SELECTION_PREFIX}${group}`;
}

function suggestionSelectionValue(value: string) {
  return `${SUGGESTION_SELECTION_PREFIX}${value}`;
}

function optionLabel(options: ComboboxOption[], value: string) {
  return (
    options.find((option) => option.value === value)?.label ??
    (value.startsWith("new:") ? value.slice(4) : value)
  );
}

export function CreatableCombobox({
  options,
  value,
  onValueChange,
  onInputValueChange,
  placeholder,
  suggestionLabel = "Forslag",
  suggestionOptions = [],
  allowCreate = false,
  disabled = false,
  ariaLabel,
  ariaInvalid = false,
}: {
  options: ComboboxOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  onInputValueChange?: (value: string) => void;
  placeholder: string;
  suggestionLabel?: string;
  suggestionOptions?: ComboboxOption[];
  allowCreate?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  ariaInvalid?: boolean;
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

  const suggestionValues = new Set(
    suggestionOptions.map((option) => option.value),
  );
  const regularOptions = visibleOptions.filter(
    (option) => !suggestionValues.has(option.value),
  );
  const displayedOptions = [...suggestionOptions, ...regularOptions];
  const itemValues = displayedOptions.map((option) => option.value);

  function commitInput() {
    const label = inputValue.trim();
    if (!label) return false;

    const existing = options.find(
      (option) =>
        option.label.toLocaleLowerCase("da") === label.toLocaleLowerCase("da"),
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
        const label = displayedOptions.find(
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
        displayedOptions.find((option) => option.value === itemValue)?.label ??
        ""
      }
    >
      <ComboboxInput
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
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
          {suggestionOptions.length ? (
            <ComboboxGroup>
              <ComboboxLabel>{suggestionLabel}</ComboboxLabel>
              {suggestionOptions.map((option) => (
                <ComboboxItem
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="min-h-10"
                >
                  {option.label}
                </ComboboxItem>
              ))}
            </ComboboxGroup>
          ) : null}
          {suggestionOptions.length && regularOptions.length ? (
            <ComboboxSeparator />
          ) : null}
          <ComboboxGroup>
            {regularOptions.map((option) => (
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
          </ComboboxGroup>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export function CreatableMultiCombobox({
  options,
  values,
  onValuesChange,
  placeholder,
  allowCreate = false,
  preserveSearchOnSelect = false,
  selectableGroups = false,
  groups,
  suggestionLabel = "Forslag",
  suggestionValues = [],
  disabled = false,
  ariaLabel,
}: {
  options: ComboboxOption[];
  values: string[];
  onValuesChange: (values: string[]) => void;
  placeholder: string;
  allowCreate?: boolean;
  preserveSearchOnSelect?: boolean;
  selectableGroups?: boolean;
  groups?: ComboboxOptionGroup[];
  suggestionLabel?: string;
  suggestionValues?: readonly string[];
  disabled?: boolean;
  ariaLabel: string;
}) {
  const anchor = useComboboxAnchor();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedValue, setHighlightedValue] = useState<string>();

  function labelFor(value: string) {
    return optionLabel(options, value);
  }

  const visibleOptions = useMemo(() => {
    const query = inputValue.trim().toLocaleLowerCase("da");
    const matches = query
      ? options.filter((option) =>
          [option.label, option.group, option.groupLabel, option.searchText]
            .filter((value): value is string => Boolean(value))
            .some((value) => value.toLocaleLowerCase("da").includes(query)),
        )
      : options;
    const exactMatch = [
      ...options.map((option) => option.value),
      ...values,
    ].some(
      (value) => optionLabel(options, value).toLocaleLowerCase("da") === query,
    );
    if (allowCreate && query && !exactMatch) {
      return [
        ...matches,
        { value: `new:${inputValue.trim()}`, label: inputValue.trim() },
      ];
    }
    return matches;
  }, [allowCreate, inputValue, options, values]);
  const optionsByValue = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  );
  const suggestionOptions = suggestionValues.flatMap((value) => {
    const option = optionsByValue.get(value);
    return option ? [option] : [];
  });
  const visibleOptionValues = useMemo(
    () => new Set(visibleOptions.map((option) => option.value)),
    [visibleOptions],
  );
  const visibleSuggestionOptions = suggestionOptions.filter((option) =>
    visibleOptionValues.has(option.value),
  );
  const optionGroups = useMemo(() => {
    const optionsByGroup = new Map<string, ComboboxOption[]>();
    for (const option of visibleOptions) {
      const group = option.group ?? "";
      const groupOptions = optionsByGroup.get(group);
      if (groupOptions) groupOptions.push(option);
      else optionsByGroup.set(group, [option]);
    }
    if (groups) {
      return groups
        .filter((group) =>
          group.optionValues.some((value) => visibleOptionValues.has(value)),
        )
        .map((group) => ({
          value: group.value,
          label: group.label,
          title: group.title,
          depth: group.depth,
          options: optionsByGroup.get(group.value) ?? [],
        }));
    }
    return [...optionsByGroup].map(([value, groupOptions]) => ({
      value,
      label: groupOptions[0]?.groupLabel ?? value,
      title: value,
      depth: groupOptions[0]?.groupDepth ?? 0,
      options: groupOptions,
    }));
  }, [groups, visibleOptionValues, visibleOptions]);
  const selectableOptionValuesByGroup = useMemo(() => {
    const selectableValues = new Map<string, string[]>();
    if (!selectableGroups) return selectableValues;
    if (groups) {
      for (const group of groups) {
        selectableValues.set(
          group.value,
          group.optionValues.filter((value) => {
            const option = optionsByValue.get(value);
            return option !== undefined && !option.disabled;
          }),
        );
      }
      return selectableValues;
    }
    for (const option of options) {
      if (!option.group || option.disabled) continue;
      const groupValues = selectableValues.get(option.group);
      if (groupValues) groupValues.push(option.value);
      else selectableValues.set(option.group, [option.value]);
    }
    return selectableValues;
  }, [groups, options, optionsByValue, selectableGroups]);
  const groupOptionsByValue = new Map(
    [...selectableOptionValuesByGroup].map(([group, optionValues]) => [
      groupSelectionValue(group),
      optionValues,
    ]),
  );
  const selectedValueSet = new Set(values);
  const selectedGroupValues = new Set(
    [...groupOptionsByValue]
      .filter(
        ([, optionValues]) =>
          optionValues.length > 0 &&
          optionValues.every((value) => selectedValueSet.has(value)),
      )
      .map(([value]) => value),
  );
  const suggestionOptionsByValue = new Map(
    suggestionOptions.map((option) => [
      suggestionSelectionValue(option.value),
      option.value,
    ]),
  );
  const selectedSuggestionValues = new Set(
    [...suggestionOptionsByValue]
      .filter(([, value]) => selectedValueSet.has(value))
      .map(([value]) => value),
  );
  const comboboxValues = [
    ...values,
    ...selectedGroupValues,
    ...selectedSuggestionValues,
  ];
  const groupLabelsByValue = new Map(
    (groups ?? optionGroups).map((group) => [
      groupSelectionValue(group.value),
      group.label,
    ]),
  );
  const itemValues = [
    ...visibleSuggestionOptions.map((option) =>
      suggestionSelectionValue(option.value),
    ),
    ...optionGroups.flatMap((group) => [
      ...(selectableGroups && group.value
        ? [groupSelectionValue(group.value)]
        : []),
      ...group.options.map((option) => option.value),
    ]),
  ];

  useEffect(() => {
    if (!open || inputValue || visibleSuggestionOptions.length === 0) return;
    const frame = requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [inputValue, open, visibleSuggestionOptions.length]);

  function commitInput() {
    const label = inputValue.trim();
    if (!label) return false;
    const existing = options.find(
      (option) =>
        option.label.toLocaleLowerCase("da") === label.toLocaleLowerCase("da"),
    );
    const selectedValue = values.find(
      (value) =>
        labelFor(value).toLocaleLowerCase("da") ===
        label.toLocaleLowerCase("da"),
    );
    const nextValue =
      existing?.value ?? selectedValue ?? (allowCreate ? `new:${label}` : null);
    if (!nextValue) return false;
    if (!values.includes(nextValue)) onValuesChange([...values, nextValue]);
    if (!preserveSearchOnSelect) setInputValue("");
    setHighlightedValue(undefined);
    return true;
  }

  return (
    <Combobox
      multiple
      items={itemValues}
      filteredItems={itemValues}
      value={comboboxValues}
      inputValue={inputValue}
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (
          !nextOpen &&
          preserveSearchOnSelect &&
          eventDetails.reason === "item-press"
        ) {
          eventDetails.cancel();
          return;
        }
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
        setInputValue(nextValue);
        setHighlightedValue(undefined);
      }}
      onValueChange={(nextValues) => {
        const nextActualValues = nextValues.filter(
          (value) =>
            !groupOptionsByValue.has(value) &&
            !suggestionOptionsByValue.has(value),
        );
        const nextActualValueSet = new Set(nextActualValues);
        const actualValuesChanged =
          nextActualValueSet.size !== selectedValueSet.size ||
          [...nextActualValueSet].some((value) => !selectedValueSet.has(value));
        const toggledGroupValue = [...groupOptionsByValue.keys()].find(
          (value) =>
            nextValues.includes(value) !== selectedGroupValues.has(value),
        );
        const toggledSuggestionValue = [
          ...suggestionOptionsByValue.keys(),
        ].find(
          (value) =>
            nextValues.includes(value) !== selectedSuggestionValues.has(value),
        );
        if (actualValuesChanged) {
          onValuesChange(nextActualValues);
        } else if (toggledGroupValue) {
          const groupOptionValues =
            groupOptionsByValue.get(toggledGroupValue) ?? [];
          const allSelected = groupOptionValues.every((value) =>
            selectedValueSet.has(value),
          );
          onValuesChange(
            allSelected
              ? values.filter((value) => !groupOptionValues.includes(value))
              : [
                  ...values,
                  ...groupOptionValues.filter(
                    (value) => !selectedValueSet.has(value),
                  ),
                ],
          );
        } else if (toggledSuggestionValue) {
          const suggestionValue = suggestionOptionsByValue.get(
            toggledSuggestionValue,
          );
          if (suggestionValue) {
            onValuesChange(
              selectedValueSet.has(suggestionValue)
                ? values.filter((value) => value !== suggestionValue)
                : [...values, suggestionValue],
            );
          }
        }
        if (!preserveSearchOnSelect) setInputValue("");
        setHighlightedValue(undefined);
      }}
      disabled={disabled}
      itemToStringLabel={(value) =>
        groupOptionsByValue.has(value)
          ? (groupLabelsByValue.get(value) ??
            value.slice(GROUP_SELECTION_PREFIX.length))
          : suggestionOptionsByValue.has(value)
            ? labelFor(suggestionOptionsByValue.get(value) ?? value)
            : labelFor(value)
      }
    >
      <ComboboxChips ref={anchor} className="min-h-11 w-full">
        <ComboboxValue>
          {(selectedValues: string[]) =>
            selectedValues
              .filter(
                (value) =>
                  !groupOptionsByValue.has(value) &&
                  !suggestionOptionsByValue.has(value),
              )
              .map((value) => (
                <ComboboxChip
                  key={value}
                  removeLabel={`Fjern ${labelFor(value)}`}
                >
                  {labelFor(value)}
                </ComboboxChip>
              ))
          }
        </ComboboxValue>
        <ComboboxChipsInput
          placeholder={values.length === 0 ? placeholder : undefined}
          aria-label={ariaLabel}
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
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>Ingen resultater fundet.</ComboboxEmpty>
        <ComboboxList ref={listRef}>
          {visibleSuggestionOptions.length > 0 ? (
            <>
              <ComboboxGroup>
                <ComboboxLabel>{suggestionLabel}</ComboboxLabel>
                {visibleSuggestionOptions.map((option) => (
                  <ComboboxItem
                    key={`suggestion:${option.value}`}
                    value={suggestionSelectionValue(option.value)}
                    disabled={option.disabled}
                    className="min-h-10"
                  >
                    {option.label}
                  </ComboboxItem>
                ))}
              </ComboboxGroup>
              {optionGroups.length > 0 ? <ComboboxSeparator /> : null}
            </>
          ) : null}
          {optionGroups.map((group, index) => {
            const groupDepth = Math.max(0, Math.min(group.depth, 6));
            const selectableGroupValues =
              selectableOptionValuesByGroup.get(group.value) ?? [];
            const selectedGroupCount = selectableGroupValues.filter((value) =>
              selectedValueSet.has(value),
            ).length;
            const groupStatus =
              selectableGroupValues.length === 0
                ? "Ingen kan vælges"
                : selectedGroupCount === selectableGroupValues.length
                  ? "Alle valgt"
                  : selectedGroupCount > 0
                    ? `${selectedGroupCount} af ${selectableGroupValues.length} valgt`
                    : "Vælg alle";

            return (
              <Fragment
                key={group.value ? `group:${group.value}` : "ungrouped"}
              >
                {index > 0 && (!selectableGroups || groupDepth === 0) ? (
                  <ComboboxSeparator />
                ) : null}
                <ComboboxGroup>
                  {group.value ? (
                    selectableGroups ? (
                      <>
                        <ComboboxLabel className="sr-only">
                          {group.label}
                        </ComboboxLabel>
                        <ComboboxItem
                          value={groupSelectionValue(group.value)}
                          disabled={selectableGroupValues.length === 0}
                          className="min-h-10"
                          style={{
                            paddingInlineStart: `${0.375 + groupDepth}rem`,
                          }}
                        >
                          <FolderIcon aria-hidden="true" />
                          <span
                            className="min-w-0 flex-1 truncate font-medium"
                            title={group.title ?? group.label}
                          >
                            {group.label}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {groupStatus}
                          </span>
                        </ComboboxItem>
                      </>
                    ) : (
                      <ComboboxLabel>{group.label}</ComboboxLabel>
                    )
                  ) : null}
                  {group.options.map((option) => (
                    <ComboboxItem
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                      className="min-h-10"
                      style={
                        selectableGroups
                          ? {
                              paddingInlineStart: `${1.875 + groupDepth}rem`,
                            }
                          : undefined
                      }
                    >
                      {option.value.startsWith("new:") ? (
                        <PlusIcon aria-hidden="true" />
                      ) : null}
                      {option.value.startsWith("new:")
                        ? `Opret “${option.label}”`
                        : option.label}
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              </Fragment>
            );
          })}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
