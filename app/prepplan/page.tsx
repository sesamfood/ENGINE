"use client";

import dynamic from "next/dynamic";
import { AppPageHeader, PageTitle } from "@/components/app-page-header";
import { useAccess, useKiosk, usePermission } from "@/components/app-shell";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { RowsSkeleton } from "@/components/page-skeletons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const PrepPlan = dynamic(
  () =>
    import("@/components/prepplan/prep-plan").then((module) => module.PrepPlan),
  { loading: () => <RowsSkeleton /> },
);

function PrepPlanContent() {
  const access = useAccess();
  const kiosk = useKiosk();
  const canUse = usePermission("prepplan.use");
  const allowed = kiosk?.kioskModeEnabled
    ? Boolean(kiosk.settings?.enabledPages.includes("prepplan.view"))
    : canUse;

  if (!access) return <RowsSkeleton />;
  if (!allowed) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>Du har ikke adgang til Prepplan.</AlertDescription>
      </Alert>
    );
  }
  return <PrepPlan />;
}

export default function PrepPlanPage() {
  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6">
      <AppPageHeader>
        <PageTitle>Prepplan</PageTitle>
      </AppPageHeader>
      <OrganizationAuthGate>
        <PrepPlanContent />
      </OrganizationAuthGate>
    </section>
  );
}
