"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Switch } from "@/components/ui/switch";

export function SettingsSwitchField({
  label,
  help,
  description,
  fieldClassName,
  invalid,
  id,
  disabled,
  ...props
}: ComponentProps<typeof Switch> & {
  label: ReactNode;
  help?: ComponentProps<typeof HelpTooltip>;
  description?: ReactNode;
  fieldClassName?: string;
  invalid?: boolean;
}) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <Field
      orientation="horizontal"
      className={fieldClassName}
      data-disabled={disabled}
      data-invalid={invalid}
    >
      <FieldContent>
        <div className="flex items-center gap-1">
          <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
          {help ? <HelpTooltip {...help} /> : null}
        </div>
        {description}
      </FieldContent>
      <Switch {...props} id={controlId} disabled={disabled} />
    </Field>
  );
}
