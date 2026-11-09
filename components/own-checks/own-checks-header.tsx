"use client";

import { AppPageHeader, PageTitle } from "@/components/app-page-header";

export function OwnChecksHeader() {
  const title = (
    <div className="flex min-w-0 flex-col gap-2">
      <PageTitle>
        Egenkontrol
      </PageTitle>
    </div>
  );

  return <AppPageHeader>{title}</AppPageHeader>;
}
