"use client"

import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const tableAppearance = cva("", {
  variants: {
    appearance: {
      widget:
        "@max-[12rem]:text-xs @max-[12rem]:[&_th]:px-1 @max-[12rem]:[&_td]:px-1",
      compactWidget:
        "@max-[12rem]:text-xs @max-[12rem]:[&_th]:px-1 @max-[12rem]:[&_td]:px-1 text-xs",
    },
  },
})

function Table({
  appearance,
  className,
  ...props
}: React.ComponentProps<"table"> & VariantProps<typeof tableAppearance>) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom text-sm",
          tableAppearance({ appearance }),
          className,
        )}
        {...props}
      />
    </div>
  )
}

const tableHeaderAppearance = cva("", {
  variants: {
    appearance: {
      surface: "bg-card",
    },
  },
})

function TableHeader({
  appearance,
  className,
  ...props
}: React.ComponentProps<"thead"> & VariantProps<typeof tableHeaderAppearance>) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "[&_tr]:border-b",
        tableHeaderAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

const tableRowAppearance = cva("", {
  variants: {
    appearance: {
      section: "bg-muted/50 hover:bg-muted/50",
      interactive:
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      selectable:
        "focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
      spaced: "[&>td]:py-3",
      order:
        "focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    },
  },
})

function TableRow({
  appearance,
  className,
  ...props
}: React.ComponentProps<"tr"> & VariantProps<typeof tableRowAppearance>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        tableRowAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

const tableHeadAppearance = cva("", {
  variants: {
    appearance: {
      metric: "py-4 font-medium",
      frozenLabel: "sticky left-0 z-30 bg-card",
      muted: "bg-muted/30",
      day: "border-l",
      currentDay: "border-l bg-primary/5",
    },
  },
})

function TableHead({
  appearance,
  className,
  ...props
}: React.ComponentProps<"th"> & VariantProps<typeof tableHeadAppearance>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        tableHeadAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

const tableCellAppearance = cva("", {
  variants: {
    appearance: {
      label: "font-medium",
      numeric: "tabular-nums",
      metric: "py-4 tabular-nums",
      surface: "bg-card",
      muted: "text-muted-foreground",
      total: "font-semibold tabular-nums",
      spaced: "py-3",
      code: "font-mono text-xs",
      heading: "font-semibold",
      checkbox: "[&:has([role=checkbox])]:pr-2",
      truncate: "truncate",
      labelTruncate: "truncate font-medium",
      compactLabel: "truncate font-medium py-1.5",
      compactLabelWrap: "font-medium py-1.5 whitespace-normal break-words",
      frozenLabel: "sticky left-0 z-10 bg-card font-medium whitespace-normal",
      changed: "bg-primary/10",
      compactNumeric: "tabular-nums py-1.5",
      day: "border-l p-2",
      currentDay: "border-l p-2 bg-primary/5",
    },
  },
})

function TableCell({
  appearance,
  className,
  ...props
}: React.ComponentProps<"td"> & VariantProps<typeof tableCellAppearance>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        tableCellAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
