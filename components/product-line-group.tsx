import { PackageOpenIcon } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

export function ProductLineGroup({
  productName,
  imageUrl,
  action,
  status,
  children,
}: {
  productName: string;
  imageUrl: string | null;
  action?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex items-center gap-3">
        <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={`Produktbillede af ${productName}`}
              fill
              sizes="3.5rem"
              className="object-cover"
            />
          ) : (
            <PackageOpenIcon className="size-6" aria-hidden="true" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <p className="min-w-0 flex-1 truncate font-medium">{productName}</p>
          {status}
        </div>
        {action}
      </div>
      {children}
    </li>
  );
}
