import {
  ArrowRightIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronDownIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  HelpSetting,
  SettingControl,
} from "@/components/help/help-features";

function ControlPreview({ control }: { control: SettingControl }) {
  switch (control.kind) {
    case "switch":
      return (
        <div className="flex min-w-40 items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-xs font-medium">
          <span>{control.value}</span>
          <span className="h-6 w-10 rounded-full bg-primary p-1">
            <span className="ml-auto block size-4 rounded-full bg-primary-foreground" />
          </span>
        </div>
      );
    case "select":
      return (
        <div className="flex min-w-40 items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-xs font-medium">
          <span className="truncate">{control.value}</span>
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </div>
      );
    case "fields":
      return (
        <div className="flex flex-wrap justify-end gap-1.5">
          {control.values.map((value) => (
            <Badge key={value} variant="secondary">
              {value}
            </Badge>
          ))}
        </div>
      );
    case "mapping":
      return (
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="rounded-lg border bg-background px-2.5 py-2">{control.from}</span>
          <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="rounded-lg border bg-background px-2.5 py-2">{control.to}</span>
        </div>
      );
    case "permissions":
      return (
        <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
          <div className="flex gap-1">
            {Array.from({ length: 3 }, (_, index) => (
              <span
                key={index}
                className="grid size-4 place-items-center rounded-sm bg-primary text-primary-foreground"
              >
                <CheckIcon className="size-2.5" />
              </span>
            ))}
          </div>
          <span className="text-xs font-medium">{control.value}</span>
        </div>
      );
    case "schedule":
      return (
        <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs font-medium">
          <CalendarDaysIcon className="size-3.5 text-primary" />
          {control.value}
        </div>
      );
  }

  const exhaustive: never = control;
  return exhaustive;
}

export function SettingsVisual({ settings }: { settings: HelpSetting[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex min-h-11 items-center gap-2 border-b px-4">
        <SlidersHorizontalIcon className="size-4 text-primary" aria-hidden="true" />
        <span className="text-sm font-semibold">Indstillinger</span>
        <Badge variant="outline" className="ml-auto">
          {settings.length}
        </Badge>
      </div>
      <div className="divide-y">
        {settings.map((setting, index) => (
          <section
            key={setting.title}
            className="grid gap-4 p-4 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center sm:p-5"
          >
            <span className="grid size-8 place-items-center rounded-full bg-muted font-mono text-xs font-semibold text-muted-foreground">
              {index + 1}
            </span>
            <div>
              <h3 className="text-sm font-semibold">{setting.title}</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {setting.description}
              </p>
            </div>
            <div aria-hidden="true" className="sm:justify-self-end">
              <ControlPreview control={setting.control} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
