import type { ReactNode } from "react";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { AppPageHeader, PageTitle } from "@/components/app-page-header";
import { productGridClassName } from "@/components/catalog/product-card-media";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Built from the real Card and control sizes so a page keeps its layout when
// the data arrives.

function repeat(count: number, render: (index: number) => ReactNode) {
  return Array.from({ length: count }, (_, index) => render(index));
}

export function LocationHeaderSkeleton({ title }: { title: string }) {
  return (
    <AppPageHeader>
      <div className="grid gap-5 sm:grid-cols-(--grid-cols-page-header) sm:items-center">
        <PageTitle>{title}</PageTitle>
        <Skeleton className="h-11 w-full" />
      </div>
    </AppPageHeader>
  );
}

export function FieldSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

export function CardSkeleton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <FieldGroup>{children}</FieldGroup>
      </CardContent>
    </Card>
  );
}

export function FormCardSkeleton({
  fields = 3,
  className,
}: {
  fields?: number;
  className?: string;
}) {
  return (
    <CardSkeleton className={className}>
      {repeat(fields, (index) => (
        <FieldSkeleton key={index} />
      ))}
    </CardSkeleton>
  );
}

export function ProductFormSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <div className="grid gap-6 xl:grid-cols-(--grid-cols-product-details)">
      <FormCardSkeleton fields={fields} />
      <FormCardSkeleton fields={1} />
    </div>
  );
}

export function RegistrationSkeleton() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-(--grid-cols-registration)">
      <div className="flex flex-col gap-5">
        <CardSkeleton>
          <Skeleton className="h-64 w-full" />
        </CardSkeleton>
        <FormCardSkeleton fields={2} />
      </div>
      <div className="flex flex-col gap-5">
        <CardSkeleton>
          <Skeleton className="h-14 w-full" />
        </CardSkeleton>
        <CardSkeleton>
          <Skeleton className="h-24 w-full" />
          <FieldSkeleton />
        </CardSkeleton>
        <CardSkeleton>
          <Skeleton className="h-20 w-full" />
        </CardSkeleton>
      </div>
    </div>
  );
}

export function RowsSkeleton({
  rows = 5,
  rowClassName = "h-14",
}: {
  rows?: number;
  rowClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {repeat(rows, (index) => (
        <div key={index} className={rowClassName}>
          <Skeleton className="size-full" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col divide-y overflow-hidden rounded-xl border">
      <div className="flex h-10 items-center gap-6 px-3">
        <Skeleton className="h-3.5 w-1/4" />
        <Skeleton className="h-3.5 w-1/6" />
        <Skeleton className="ml-auto h-3.5 w-1/6" />
      </div>
      {repeat(rows, (index) => (
        <div key={index} className="flex h-12 items-center gap-6 px-3">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="ml-auto h-4 w-1/6" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({
  count = 6,
  cardClassName = "h-40",
}: {
  count?: number;
  cardClassName?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {repeat(count, (index) => (
        <div key={index} className={cardClassName}>
          <Skeleton className="size-full" />
        </div>
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className={productGridClassName}>
      {repeat(10, (index) => (
        <Card key={index} appearance="product" spacing="responsive">
          <Skeleton
            appearance="square"
            className="aspect-video w-full lg:aspect-4/3"
          />
          {children}
        </Card>
      ))}
    </div>
  );
}

export function BottomBarSkeleton() {
  return (
    <AppBottomBar>
      <div className="mx-auto w-full max-w-(--container-page)">
        <Skeleton className="h-12 w-72 max-w-full" />
      </div>
    </AppBottomBar>
  );
}

export function DateRangeSkeleton() {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex w-full flex-col gap-5 md:flex-row">
        <FieldSkeleton />
        <FieldSkeleton />
      </div>
      <Skeleton className="h-11 w-40 shrink-0" />
    </div>
  );
}

export function ExpenseFormSkeleton() {
  return (
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-2">
      <FormCardSkeleton fields={6} />
      <div className="flex flex-col gap-5">
        <CardSkeleton>
          <Skeleton className="h-36 w-full" />
        </CardSkeleton>
        <CardSkeleton>
          <Skeleton className="h-24 w-full" />
        </CardSkeleton>
      </div>
      <BottomBarSkeleton />
    </div>
  );
}

export function OrderingChoiceSkeleton() {
  return (
    <div className="mt-4 flex flex-col gap-4">
      <Skeleton className="h-7 w-56" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}
