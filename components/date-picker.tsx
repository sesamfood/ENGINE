"use client";

import { addYears, format, isValid, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState, type ComponentProps } from "react";
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
const firstMonth = new Date(1950, 0, 1);
const lastMonth = addYears(new Date(), 10);

function parseDate(value: string | undefined) {
  if (!value) return undefined;
  const date = parseISO(value);
  return isValid(date) ? date : undefined;
}

type PickerProps = Pick<
  ComponentProps<"button">,
  "id" | "disabled" | "aria-label" | "aria-invalid" | "aria-describedby"
> & {
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
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
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
          {selected ? (
            <span className="truncate">{dateFormatter.format(selected)}</span>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}
          <CalendarIcon data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto">
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
        </PopoverContent>
      </Popover>
    </div>
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
