import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

const inputAppearance = cva("", {
  variants: {
    appearance: {
      search: "pl-10",
      code: "font-mono text-sm",
      swatch: "p-1",
      hex: "font-mono uppercase",
    },
  },
})

function Input({
  appearance,
  className,
  type,
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputAppearance>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        inputAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

export { Input }
