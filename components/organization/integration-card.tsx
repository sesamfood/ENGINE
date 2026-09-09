"use client";

import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function IntegrationCard({
  id,
  title,
  description,
  connected,
  checked,
  open,
  onOpenChange,
  onEnabledChange,
  disabled,
  disabledReason,
  className,
  contentClassName,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  connected: boolean;
  checked: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnabledChange: (enabled: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  const contentId = `${id}-settings`;
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <Card className={cn("max-w-6xl", className)}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
          <CardAction className="flex items-center gap-3">
            <Field orientation="horizontal" className="w-auto">
              <Switch
                id={`${id}-enabled`}
                aria-controls={connected ? undefined : contentId}
                aria-expanded={connected ? undefined : open}
                aria-label={`Aktivér ${title}-integration`}
                checked={checked}
                disabled={disabled}
                title={disabledReason}
                onCheckedChange={onEnabledChange}
              />
            </Field>
            <CollapsibleTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`${open ? "Skjul" : "Vis"} ${title}-indstillinger`}
                />
              }
            >
              {open ? "Skjul" : "Vis"}
              {open ? (
                <ChevronUpIcon data-icon="inline-end" />
              ) : (
                <ChevronDownIcon data-icon="inline-end" />
              )}
            </CollapsibleTrigger>
          </CardAction>
        </CardHeader>
        <CollapsibleContent id={contentId}>
          <CardContent className={contentClassName}>{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
