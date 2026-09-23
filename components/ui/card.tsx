import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const cardVariants = cva("", {
  variants: {
    appearance: {
      catalog: "gap-0 py-0 transition-shadow hover:shadow-sm",
      gallery: "gap-4 py-0",
      product: "gap-0 py-0",
      fullscreen:
        "gap-0 py-0 animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none",
      countStatus: "transition-shadow has-[button:hover]:shadow-sm",
      choice:
        "outline-none transition-[box-shadow,border-color] focus-visible:ring-3 focus-visible:ring-ring/50",
      dragPreview:
        "border-primary/50 bg-card/95 shadow-xl ring-2 ring-primary/20",
      widget:
        "gap-2 border-border/70 pb-2 shadow-sm transition-[box-shadow,border-color] duration-150",
      visualization:
        "outline-none transition-[box-shadow] focus-visible:ring-3 focus-visible:ring-ring/50",
      dateLabel: "gap-3 pt-0",
      link: "transition-colors group-hover:bg-muted/50 group-active:bg-muted/50",
      help: "gap-4 py-5",
      hover: "transition-colors hover:bg-muted/50",
      outline: "border",
      flatOutline: "border shadow-none",
      themePreview: "bg-background text-foreground",
      followUp: "border-l-4 border-l-destructive",
      error: "border-destructive/40",
      danger: "ring-destructive/30",
      staffProduct: "gap-0 py-0 transition-[opacity,filter,box-shadow]",
      menu: "transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    },
    interaction: {
      product:
        "transition-shadow has-[button[data-card-trigger]:hover]:shadow-sm",
    },
    highlight: {
      choice: "border-primary ring-2 ring-primary/25",
      resize: "border-primary shadow-md ring-2 ring-primary/20",
      visualization: "ring-2 ring-primary/30",
      selection: "outline-2 outline-primary",
      recent: "ring-2 ring-primary",
    },
    status: {
      complete: "bg-success/5 ring-success/30",
      active: "bg-info/5 ring-info/30",
      paused: "bg-paused/5 ring-paused/30",
    },
    compact: { true: "gap-1 pt-1" },
    unavailable: { true: "opacity-40 grayscale" },
    spacing: {
      relaxed: "[--card-spacing:--spacing(6)]",
      responsive:
        "[--card-spacing:--spacing(3)] lg:[--card-spacing:--spacing(4)]",
    },
  },
})

function Card({
  className,
  size = "default",
  appearance,
  interaction,
  highlight,
  status,
  compact,
  unavailable,
  spacing,
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" } & VariantProps<
    typeof cardVariants
  >) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        cardVariants({
          appearance,
          interaction,
          status,
          compact,
          unavailable,
          spacing,
          highlight,
        }),
        className,
      )}
      {...props}
    />
  )
}

const cardHeaderAppearance = cva("", {
  variants: {
    appearance: {
      padded: "py-4",
      inset: "pb-4",
      product: "py-3 lg:py-4",
      hero: "gap-3 px-5 py-5 sm:px-8 sm:py-7",
      spaced: "gap-3",
      relaxed: "gap-4",
      compact: "gap-2",
      dense: "py-2.5",
      widget: "gap-0 pb-1",
      liveWidget: "gap-0 pb-0",
    },
  },
})

function CardHeader({
  appearance,
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardHeaderAppearance>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        cardHeaderAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

const cardTitleAppearance = cva("", {
  variants: {
    appearance: {
      auth: "text-2xl",
      truncate: "truncate",
      productName: "line-clamp-2 min-h-[2lh]",
      hero: "text-3xl leading-tight tracking-tight sm:text-4xl",
      widget: "truncate text-base",
      inline: "gap-2",
      compact: "gap-1",
      standard: "text-base",
      destructive: "gap-2 text-destructive",
      large: "text-xl",
      spaced: "gap-3",
      widgetSource: "text-base gap-x-1",
    },
  },
})

function CardTitle({
  appearance,
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardTitleAppearance>) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        cardTitleAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

const cardDescriptionAppearance = cva("", {
  variants: {
    appearance: {
      truncate: "truncate",
      inline: "gap-1",
      code: "font-mono",
      summary: "line-clamp-3",
    },
  },
})

function CardDescription({
  appearance,
  className,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof cardDescriptionAppearance>) {
  return (
    <div
      data-slot="card-description"
      className={cn(
        "text-sm text-muted-foreground",
        cardDescriptionAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

const cardActionAppearance = cva("", {
  variants: {
    appearance: {
      compact: "gap-1",
      standard: "gap-2",
      spaced: "gap-3",
    },
  },
})

function CardAction({
  appearance,
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardActionAppearance>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        cardActionAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

const cardContentAppearance = cva("", {
  variants: {
    appearance: {
      product: "gap-2 pb-3 lg:gap-3 lg:pb-4",
      hero: "px-5 pb-6 sm:px-8 sm:pb-8",
      stock: "gap-1 pb-3 lg:pb-4",
      stacked: "gap-4",
      relaxed: "gap-5",
      compact: "gap-3",
      dense: "gap-2",
      spacious: "gap-6",
      report: "gap-3 text-sm",
      flush: "p-0",
      details: "gap-2 text-sm",
      text: "text-sm",
      tightText: "gap-1 text-sm",
      productGrid: "gap-2 pb-3 lg:pb-4",
      summary: "gap-4 pt-4",
      widget: "pb-0",
      editableWidget: "pb-9",
    },
    attributed: { true: "gap-2" },
  },
})

function CardContent({
  appearance,
  attributed,
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardContentAppearance>) {
  return (
    <div
      data-slot="card-content"
      className={cn(
        "px-(--card-spacing)",
        cardContentAppearance({ appearance, attributed }),
        className,
      )}
      {...props}
    />
  )
}

const cardFooterAppearance = cva("", {
  variants: {
    appearance: {
      compact: "gap-2",
      emphasized: "font-medium",
      spaced: "gap-3",
      stickyActions: "sticky bottom-0 z-20 gap-3 border-t bg-card shadow-sm",
      product: "border-t-0 p-3 pt-0",
      flush: "p-0",
    },
  },
})

function CardFooter({
  appearance,
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardFooterAppearance>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        cardFooterAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
