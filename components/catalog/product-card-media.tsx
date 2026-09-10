import { PackageOpenIcon } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

export const productGridClassName =
  "grid gap-3 min-[380px]:grid-cols-2 min-[640px]:grid-cols-3 min-[1024px]:grid-cols-4 lg:gap-5 min-[1200px]:grid-cols-5 min-[1600px]:grid-cols-6 min-[1920px]:grid-cols-7 min-[2240px]:grid-cols-8";
const productGridSizes =
  "(max-width: 379px) 100vw, (max-width: 639px) 50vw, (max-width: 1023px) 33vw, (max-width: 1199px) 25vw, (max-width: 1599px) 20vw, (max-width: 1919px) 16vw, (max-width: 2239px) 14vw, 12vw";

export function ProductCardMedia({
  imageUrl,
  alt,
  fallback,
  sizes = productGridSizes,
}: {
  imageUrl: string | null;
  alt: string;
  fallback?: ReactNode;
  sizes?: string;
}) {
  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-muted text-muted-foreground lg:aspect-[4/3]">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={alt}
          fill
          sizes={sizes}
          className="object-cover"
        />
      ) : (
        (fallback ?? (
          <PackageOpenIcon className="size-10 lg:size-12" aria-hidden="true" />
        ))
      )}
    </div>
  );
}
