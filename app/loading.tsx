import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      className="flex flex-col gap-5"
      aria-busy="true"
      aria-label="Indlæser"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-64 max-w-full" />
      </div>
      <Skeleton className="h-14 w-full" />
      <div className="grid gap-5 md:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
