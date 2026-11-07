"use client";

import { addYears, format, isValid, parseISO } from "date-fns";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import { da } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" });
const monthFormatter = new Intl.DateTimeFormat("da-DK", {
  month: "long",
  year: "numeric",
});
const shortMonthFormatter = new Intl.DateTimeFormat("da-DK", { month: "short" });
const firstMonth = new Date(1950, 0, 1);
const lastMonth = addYears(new Date(), 10);
const currentMonth = format(new Date(), "yyyy-MM");
const monthIndexes = Array.from({ length: 12 }, (_, index) => index);

function parseDate(value: string | undefined) {
  if (!value) return undefined;
  const date = parseISO(value);
  return isValid(date) ? date : undefined;
}

type ButtonProps = Pick<
  ComponentProps<"button">,
  "id" | "disabled" | "aria-label" | "aria-invalid" | "aria-describedby"
>;

function PickerPopover({
  open,
  onOpenChange,
  label,
  placeholder,
  className,
  buttonProps,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string | undefined;
  placeholder: string;
  className?: string;
  buttonProps: ButtonProps;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              appearance="field"
              className="w-full justify-between"
              {...buttonProps}
            />
          }
        >
          {label ? (
            <span className="truncate">{label}</span>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}
          <CalendarIcon data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto">
          {children}
        </PopoverContent>
      </Popover>
    </div>
  );
}

type PickerProps = ButtonProps & {
  value: string;
  onValueChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
};

// Values are the strings native date inputs used: yyyy-MM-dd.
export function DatePicker({
  value,
  onValueChange,
  min,
  max,
  required = false,
  placeholder = "Vælg dato",
  className,
  ...buttonProps
}: PickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseDate(value);
  const minDate = parseDate(min);
  const maxDate = parseDate(max);

  return (
    <PickerPopover
      open={open}
      onOpenChange={setOpen}
      label={selected ? dateFormatter.format(selected) : undefined}
      placeholder={placeholder}
      className={className}
      buttonProps={buttonProps}
    >
      <Calendar
        mode="single"
        required={required}
        locale={da}
        captionLayout="dropdown"
        selected={selected}
        defaultMonth={selected ?? minDate}
        startMonth={minDate ?? firstMonth}
        endMonth={maxDate ?? lastMonth}
        disabled={[
          ...(minDate ? [{ before: minDate }] : []),
          ...(maxDate ? [{ after: maxDate }] : []),
        ]}
        onSelect={(date: Date | undefined) => {
          onValueChange(date ? format(date, "yyyy-MM-dd") : "");
          setOpen(false);
        }}
      />
    </PickerPopover>
  );
}

// Values are the strings native month inputs used: yyyy-MM.
export function MonthPicker({
  value,
  onValueChange,
  min,
  max,
  placeholder = "Vælg måned",
  className,
  ...buttonProps
}: Omit<PickerProps, "required">) {
  const selected = parseDate(value);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number(value.slice(0, 4)));
  const shownYear = year || Number(currentMonth.slice(0, 4));
  const monthKey = (month: number) =>
    format(new Date(shownYear, month, 1), "yyyy-MM");

  return (
    <PickerPopover
      open={open}
      onOpenChange={(next) => {
        if (next) setYear(Number(value.slice(0, 4)));
        setOpen(next);
      }}
      label={selected ? monthFormatter.format(selected) : undefined}
      placeholder={placeholder}
      className={className}
      buttonProps={buttonProps}
    >
      <div className="flex w-68 items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Forrige år"
          disabled={Boolean(min && String(shownYear) <= min.slice(0, 4))}
          onClick={() => setYear(shownYear - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <span aria-live="polite" className="font-medium tabular-nums">
          {shownYear}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Næste år"
          disabled={Boolean(max && String(shownYear) >= max.slice(0, 4))}
          onClick={() => setYear(shownYear + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
      <div className="grid w-68 grid-cols-3 gap-1">
        {monthIndexes.map((month) => {
          const key = monthKey(month);
          return (
            <Button
              key={key}
              type="button"
              variant={
                key === value
                  ? "default"
                  : key === currentMonth
                    ? "secondary"
                    : "ghost"
              }
              aria-label={monthFormatter.format(new Date(shownYear, month, 1))}
              aria-pressed={key === value}
              disabled={Boolean((min && key < min) || (max && key > max))}
              onClick={() => {
                onValueChange(key);
                setOpen(false);
              }}
            >
              {shortMonthFormatter.format(new Date(shownYear, month, 1))}
            </Button>
          );
        })}
      </div>
    </PickerPopover>
  );
}

// Values are the strings native datetime inputs used: yyyy-MM-ddTHH:mm.
export function DateTimePicker({
  value,
  onValueChange,
  min,
  max,
  className,
  ...props
}: PickerProps) {
  const [date = "", time = ""] = value.split("T");

  return (
    <div className={cn("flex min-w-0 gap-2", className)}>
      <DatePicker
        {...props}
        className="min-w-0 flex-1"
        value={date}
        min={min?.slice(0, 10)}
        max={max?.slice(0, 10)}
        onValueChange={(next) =>
          onValueChange(next ? `${next}T${time || "00:00"}` : "")
        }
      />
      <Input
        type="time"
        aria-label="Klokkeslæt"
        className="w-28 shrink-0"
        value={time}
        disabled={props.disabled || !date}
        aria-invalid={props["aria-invalid"]}
        onChange={(event) => {
          if (event.target.value) onValueChange(`${date}T${event.target.value}`);
        }}
      />
    </div>
  );
}
