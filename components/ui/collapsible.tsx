"use client"

import { cva, type VariantProps } from "class-variance-authority"
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

import { cn } from "@/lib/utils"

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
  )
}

const collapsibleContentAppearance = cva("", {
  variants: {
    appearance: {
      inset: "pb-2",
    },
  },
})

function CollapsibleContent({
  className,
  appearance,
  ...props
}: CollapsiblePrimitive.Panel.Props &
  VariantProps<typeof collapsibleContentAppearance>) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      className={cn(collapsibleContentAppearance({ appearance }), className)}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
