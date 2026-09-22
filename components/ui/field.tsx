"use client"

import { useMemo } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

const fieldSetAppearance = cva("", {
  variants: {
    appearance: {
      compact: "gap-3",
      panel: "gap-2 rounded-lg border p-3",
      outline: "rounded-xl border p-4",
      spaced: "gap-5",
      dense: "gap-2",
      padded: "gap-4 rounded-xl border p-4",
    },
  },
})

function FieldSet({
  appearance,
  className,
  ...props
}: React.ComponentProps<"fieldset"> & VariantProps<typeof fieldSetAppearance>) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        "flex flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
        fieldSetAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

const fieldLegendAppearance = cva("", {
  variants: {
    appearance: {
      small: "text-sm",
      inline: "gap-1",
    },
  },
})

function FieldLegend({
  appearance,
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & {
  variant?: "legend" | "label"
} & VariantProps<typeof fieldLegendAppearance>) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "mb-1.5 font-medium data-[variant=label]:text-sm data-[variant=legend]:text-base",
        fieldLegendAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

const fieldGroupAppearance = cva("", {
  variants: {
    appearance: {
      compact: "gap-3",
      panel: "gap-3 rounded-lg border p-3",
      standard: "gap-4",
      dense: "gap-2",
      relaxed: "gap-5",
      tight: "gap-1",
      spacious: "gap-6",
      scrollable: "pr-1",
    },
  },
})

function FieldGroup({
  appearance,
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldGroupAppearance>) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "group/field-group @container/field-group flex w-full flex-col gap-5 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4",
        fieldGroupAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

const fieldVariants = cva(
  "group/field flex w-full gap-2 data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
        horizontal:
          "flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        responsive:
          "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  }
)

const fieldAppearance = cva("", {
  variants: {
    appearance: {
      outline: "rounded-lg border px-3",
      surface: "rounded-lg border bg-background p-3",
      panel: "rounded-lg border p-3",
      option: "rounded-md px-2 py-1 hover:bg-muted/50",
    },
  },
})

function Field({
  appearance,
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof fieldVariants> &
  VariantProps<typeof fieldAppearance>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(
        fieldVariants({ orientation }),
        fieldAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn(
        "group/field-content flex flex-1 flex-col gap-0.5 leading-snug",
        className
      )}
      {...props}
    />
  )
}

const fieldLabelAppearance = cva("", {
  variants: {
    appearance: {
      emphasized: "text-base font-medium",
      regular: "font-normal",
      eyebrow:
        "text-xs font-medium uppercase tracking-wide text-muted-foreground",
      inline: "gap-2",
      large: "text-base",
    },
  },
})

function FieldLabel({
  appearance,
  className,
  ...props
}: React.ComponentProps<typeof Label> &
  VariantProps<typeof fieldLabelAppearance>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50 has-data-checked:border-primary/30 has-data-checked:bg-primary/5 has-[>[data-slot=field]]:rounded-lg has-[>[data-slot=field]]:border *:data-[slot=field]:p-2.5 dark:has-data-checked:border-primary/20 dark:has-data-checked:bg-primary/10",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col",
        fieldLabelAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

const fieldTitleAppearance = cva("", {
  variants: {
    appearance: {
      eyebrow: "text-xs uppercase tracking-wide text-muted-foreground",
    },
  },
})

function FieldTitle({
  appearance,
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldTitleAppearance>) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "flex w-fit items-center gap-2 text-sm font-medium group-data-[disabled=true]/field:opacity-50",
        fieldTitleAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

const fieldDescriptionAppearance = cva("", {
  variants: {
    appearance: {
      inline: "gap-2",
      truncate: "truncate",
      destructive: "text-destructive",
    },
  },
})

function FieldDescription({
  appearance,
  className,
  ...props
}: React.ComponentProps<"p"> &
  VariantProps<typeof fieldDescriptionAppearance>) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "text-left text-sm leading-normal font-normal text-muted-foreground group-has-data-horizontal/field:text-balance [[data-variant=legend]+&]:-mt-1.5",
        "last:mt-0 nth-last-2:-mt-1",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        fieldDescriptionAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        "relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2",
        className
      )}
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {children && (
        <span
          className="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  )
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>
}) {
  const content = useMemo(() => {
    if (children) {
      return children
    }

    if (!errors?.length) {
      return null
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ]

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map(
          (error, index) =>
            error?.message && <li key={index}>{error.message}</li>
        )}
      </ul>
    )
  }, [children, errors])

  if (!content) {
    return null
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-sm font-normal text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  )
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
}
