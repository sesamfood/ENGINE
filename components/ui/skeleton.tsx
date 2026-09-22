import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const skeletonAppearance = cva("", {
  variants: {
    appearance: {
      square: "rounded-none",
    },
  },
})

function Skeleton({
  appearance,
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof skeletonAppearance>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-md bg-muted",
        skeletonAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
