"use client"

import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { resolveOverlayFocus } from "@/lib/overlay-focus"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

const dialogTriggerAppearance = cva("", {
  variants: {
    appearance: {
      card: "rounded-t-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      image:
        "rounded-xl border outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    },
  },
})

function DialogTrigger({
  className,
  appearance,
  ...props
}: DialogPrimitive.Trigger.Props &
  VariantProps<typeof dialogTriggerAppearance>) {
  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      className={cn(dialogTriggerAppearance({ appearance }), className)}
      {...props}
    />
  )
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

const dialogOverlayAppearance = cva("", {
  variants: {
    appearance: {
      image: "bg-black/80 duration-200 motion-reduce:animate-none",
    },
  },
})

function DialogOverlay({
  appearance,
  className,
  ...props
}: DialogPrimitive.Backdrop.Props &
  VariantProps<typeof dialogOverlayAppearance>) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        dialogOverlayAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

const dialogContentAppearance = cva("", {
  variants: {
    appearance: {
      search: "gap-0 p-2",
      flush: "p-0",
    },
  },
})

function DialogContent({
  appearance,
  className,
  children,
  showCloseButton = true,
  initialFocus,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
} & VariantProps<typeof dialogContentAppearance>) {
  const popupRef = React.useRef<HTMLDivElement>(null)

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        ref={popupRef}
        initialFocus={(openType) =>
          resolveOverlayFocus(openType, popupRef.current, initialFocus)
        }
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          dialogContentAppearance({ appearance }),
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Luk</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

const dialogHeaderAppearance = cva("", {
  variants: {
    appearance: {
      inset: "px-5 pt-5",
    },
  },
})

function DialogHeader({
  appearance,
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof dialogHeaderAppearance>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-col gap-2",
        dialogHeaderAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

const dialogFooterAppearance = cva("", {
  variants: {
    appearance: {
      inset: "px-5 pt-4 pb-5",
    },
  },
})

function DialogFooter({
  appearance,
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
} & VariantProps<typeof dialogFooterAppearance>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        dialogFooterAppearance({ appearance }),
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Luk
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

const dialogDescriptionAppearance = cva("", {
  variants: {
    appearance: {
      caption: "rounded-lg bg-background px-3 py-2 text-xs leading-5",
    },
  },
})

function DialogDescription({
  appearance,
  className,
  ...props
}: DialogPrimitive.Description.Props &
  VariantProps<typeof dialogDescriptionAppearance>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        dialogDescriptionAppearance({ appearance }),
        className,
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
