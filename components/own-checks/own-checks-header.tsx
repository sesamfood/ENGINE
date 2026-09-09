"use client";

import { AppPageHeader } from "@/components/app-page-header";

export function OwnChecksHeader() {
  const title = (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">
        Fødevaresikkerhed
      </p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Egenkontrol
      </h1>
    </div>
  );

  return <AppPageHeader>{title}</AppPageHeader>;
}
