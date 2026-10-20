"use client";

import { useMutation, useQuery } from "convex/react";
import { BlocksIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { usePlatformRole } from "@/components/platform/platform-shell";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { getUserErrorMessage } from "@/lib/user-errors";

export type UnavailableDisplay = "disabled" | "hidden";

export const unavailableDisplayOptions: {
  value: UnavailableDisplay;
  label: string;
}[] = [
  { value: "disabled", label: "Vis nedtonet" },
  { value: "hidden", label: "Skjul" },
];

const settingsPath = "/platform/settings";

const sections = [
  {
    href: `${settingsPath}/features`,
    title: "Funktioner",
    description: "Standardindstillinger for funktioner i alle organisationer.",
    icon: BlocksIcon,
  },
];

export function PlatformSettingsHeader() {
  const pathname = usePathname();
  const section = sections.find((item) => pathname.startsWith(item.href));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {section ? (
        <Link
          href={settingsPath}
          className="w-fit rounded-sm text-sm font-semibold uppercase tracking-widest text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Indstillinger
        </Link>
      ) : null}
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {section?.title ?? "Indstillinger"}
      </h1>
    </div>
  );
}

export function PlatformSettingsOverview() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          aria-label={`Åbn ${section.title.toLocaleLowerCase("da")}`}
          className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Card size="sm" appearance="link" className="h-full">
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
              <CardAction>
                <section.icon
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              </CardAction>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export function PlatformFeatureSettings() {
  const role = usePlatformRole();
  const settings = useQuery(api.platform.settings.get);
  const setUnavailableDisplay = useMutation(
    api.platform.settings.setUnavailableDisplay,
  );
  const [saving, setSaving] = useState(false);
  const canEdit = role === "owner";

  async function change(value: UnavailableDisplay) {
    setSaving(true);
    try {
      await setUnavailableDisplay({ unavailableDisplay: value });
      toast.success("Indstillingen er gemt");
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Indstillingen kunne ikke gemmes. Prøv igen."),
      );
    } finally {
      setSaving(false);
    }
  }

  if (settings === undefined) {
    return <Skeleton className="h-40 w-full max-w-3xl" />;
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Funktioner uden for abonnementet</CardTitle>
        <CardDescription>
          Standard for alle organisationer. Kan ændres for den enkelte
          organisation under Funktioner.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field className="sm:max-w-sm">
          <FieldLabel htmlFor="platform-unavailable-display">
            Visning i Administration
          </FieldLabel>
          <Select
            items={unavailableDisplayOptions}
            value={settings.unavailableDisplay}
            disabled={!canEdit || saving}
            onValueChange={(value) =>
              void change(value as UnavailableDisplay)
            }
          >
            <SelectTrigger
              id="platform-unavailable-display"
              className="h-11! w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {unavailableDisplayOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {!canEdit ? (
            <FieldDescription>
              Kun platformejere kan ændre indstillingen.
            </FieldDescription>
          ) : null}
        </Field>
      </CardContent>
    </Card>
  );
}
