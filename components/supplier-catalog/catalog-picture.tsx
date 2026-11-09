"use client";

import { PackageOpenIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A lazily loaded catalog picture for long lists. Supplier pictures can be
 * several megabytes, and Avatar preloads every image up front.
 */
export function CatalogPicture({
  src,
  className,
}: {
  src: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground",
        className,
      )}
    >
      {src && !failed ? (
        // External supplier hosts vary, so next/image is not used.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <PackageOpenIcon className="size-1/2 max-w-6" />
      )}
    </div>
  );
}
