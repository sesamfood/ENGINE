"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Maximize2Icon, XIcon } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { HelpScreenshot as Screenshot } from "./help-types";

export function HelpScreenshot({ screenshot }: { screenshot: Screenshot }) {
  return (
    <Dialog>
      <figure
        className="mt-6 w-full"
        style={{
          maxWidth: `min(${screenshot.width}px, ${(28 * screenshot.width) / screenshot.height}rem)`,
        }}
      >
        <DialogTrigger
          className="block w-full cursor-zoom-in overflow-hidden rounded-xl border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={`${screenshot.alt}. Forstør billedet`}
        >
          <Image
            src={screenshot.src}
            alt={screenshot.alt}
            width={screenshot.width}
            height={screenshot.height}
            sizes="(min-width: 1280px) 864px, (min-width: 1024px) calc(100vw - 352px), (min-width: 640px) calc(100vw - 48px), calc(100vw - 32px)"
            className="h-auto w-full"
          />
        </DialogTrigger>
        <figcaption className="mt-2 flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
          <p className="max-w-2xl py-2 text-xs leading-5 text-muted-foreground">
            {screenshot.caption}
          </p>
          <DialogTrigger
            render={
              <Button variant="link" size="sm" className="min-h-11 px-0" />
            }
          >
            <Maximize2Icon data-icon="inline-start" aria-hidden="true" />
            Forstør billedet
          </DialogTrigger>
        </figcaption>
      </figure>
      <DialogPortal>
        <DialogOverlay className="bg-black/80 duration-200 motion-reduce:animate-none" />
        <DialogPrimitive.Popup
          className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 outline-none transition-[scale,opacity] duration-200 ease-out data-starting-style:scale-90 data-starting-style:opacity-0 data-ending-style:scale-90 data-ending-style:opacity-0 motion-reduce:transition-none"
          style={{
            width: `min(calc(100vw - 2rem), calc((100dvh - 10rem) * ${screenshot.width / screenshot.height}))`,
          }}
        >
          <DialogTitle className="sr-only">{screenshot.alt}</DialogTitle>
          <DialogClose
            render={
              <Button
                variant="secondary"
                size="icon-lg"
                className="mb-3 ml-auto flex size-11"
              />
            }
            aria-label="Luk billedet"
          >
            <XIcon aria-hidden="true" />
          </DialogClose>
          <Image
            src={screenshot.src}
            alt={screenshot.alt}
            width={screenshot.width}
            height={screenshot.height}
            sizes="100vw"
            className="h-auto w-full rounded-lg bg-background shadow-2xl"
          />
          <DialogDescription className="mt-3 max-h-16 overflow-y-auto rounded-lg bg-background px-3 py-2 text-xs leading-5">
            {screenshot.caption}
          </DialogDescription>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
