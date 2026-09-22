"use client"

import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { SearchIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group"

const commandAppearance = cva("", {
  variants: {
    appearance: {
      outline: "rounded-lg border",
      search: "[&_[data-slot=command-input-wrapper]]:pr-12",
    },
  },
})

function Command({
  appearance,
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive> &
  VariantProps<typeof commandAppearance>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-xl bg-popover p-1 text-popover-foreground",
        commandAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="p-1 pb-0">
      <InputGroup className="h-8 rounded-lg border-input/30 bg-input/30 shadow-none *:data-[slot=input-group-addon]:pl-2">
        <CommandPrimitive.Input
          data-slot="command-input"
          className={cn("w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50", className)}
          {...props}
        />
        <InputGroupAddon><SearchIcon className="size-4 shrink-0 opacity-50" /></InputGroupAddon>
      </InputGroup>
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
        className,
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-6 text-center text-sm", className)}
      {...props}
    />
  )
}

const commandGroupAppearance = cva("", {
  variants: {
    appearance: {
      cards: "gap-2 [&>[cmdk-group-items]]:gap-2",
    },
  },
})

function CommandGroup({
  appearance,
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group> &
  VariantProps<typeof commandGroupAppearance>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground",
        commandGroupAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  )
}

const commandItemAppearance = cva("", {
  variants: {
    appearance: {
      create:
        "rounded-lg border border-dashed p-3 focus-visible:ring-3 focus-visible:ring-ring/50",
      search:
        "gap-3 py-2 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
      metric:
        "rounded-lg border bg-card p-3 shadow-xs transition-[background-color,box-shadow,border-color] hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
      customMetric:
        "rounded-lg border bg-card p-3 pr-24 shadow-xs transition-[background-color,box-shadow,border-color] hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
    },
    highlighted: { true: "border-primary bg-primary/5 ring-2 ring-primary/20" },
  },
})

function CommandItem({
  appearance,
  highlighted,
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item> &
  VariantProps<typeof commandItemAppearance>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        commandItemAppearance({ appearance, highlighted }),
        className,
      )}
      {...props}
    />
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
}
