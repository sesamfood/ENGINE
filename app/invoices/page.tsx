"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { AppPageHeader, PageTitle } from "@/components/app-page-header";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { SectionNav } from "@/components/section-nav";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BottomBarSkeleton, FieldSkeleton, ProductFormSkeleton, TableSkeleton } from "@/components/page-skeletons";
import { useAccess, useKiosk, usePermission } from "@/components/app-shell";
import { HistoryIcon, PlusIcon } from "lucide-react";

const tabSkeletons = {
  new: (
    <>
      <ProductFormSkeleton fields={6} />
      <BottomBarSkeleton />
    </>
  ),
  history: (
    <div className="flex flex-col gap-5">
      <FieldSkeleton className="max-w-sm" />
      <TableSkeleton />
      <BottomBarSkeleton />
    </div>
  ),
};

const InvoiceForm = dynamic(
  () =>
    import("@/components/invoices/invoice-form").then(
      (module) => module.InvoiceForm,
    ),
  { loading: () => tabSkeletons.new },
);
const InvoiceHistory = dynamic(
  () =>
    import("@/components/invoices/invoice-history").then(
      (module) => module.InvoiceHistory,
    ),
  { loading: () => tabSkeletons.history },
);

function InvoicesContent() {
  const pathname = usePathname();
  const router = useRouter();
  const access = useAccess();
  const kiosk = useKiosk();
  const canManage = usePermission("invoices.manage");
  const canView = usePermission("invoices.view");
  const kioskMode = Boolean(kiosk?.kioskModeEnabled);
  const showNew = kioskMode
    ? Boolean(kiosk?.settings?.enabledPages.includes("invoices.new"))
    : canManage;
  const showHistory = kioskMode
    ? Boolean(kiosk?.settings?.enabledPages.includes("invoices.history"))
    : canView;
  const activeTab = pathname === "/invoices/history" ? "history" : "new";
  const selectedTab =
    activeTab === "history" && showHistory
      ? "history"
      : showNew
        ? "new"
        : "history";
  const showSectionTabs = Number(showNew) + Number(showHistory) > 1;

  useEffect(() => {
    if (!showNew && !showHistory) return;
    if (activeTab === selectedTab) return;
    router.replace(
      selectedTab === "history" ? "/invoices/history" : "/invoices",
    );
  }, [activeTab, router, selectedTab, showHistory, showNew]);

  if (!access) return tabSkeletons[activeTab];

  if (!showNew && !showHistory) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at registrere eller se salg.
        </AlertDescription>
      </Alert>
    );
  }

  const sectionTabs = showSectionTabs ? (
    <SectionNav
      label="Salgssektioner"
      items={[
        { href: "/invoices", label: "Nyt salg", icon: PlusIcon, active: selectedTab === "new" },
        { href: "/invoices/history", label: "Registrerede salg", icon: HistoryIcon, active: selectedTab === "history" },
      ]}
    />
  ) : null;

  return (
    <>
      {showNew && selectedTab === "new" ? (
        <InvoiceForm navigation={sectionTabs} />
      ) : null}
      {showHistory && selectedTab === "history" ? (
        <>
          <InvoiceHistory />
          {sectionTabs ? (
            <AppBottomBar>
              <div className="mx-auto w-full max-w-(--container-page)">{sectionTabs}</div>
            </AppBottomBar>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export default function InvoicesPage() {
  const header = (
    <div className="flex min-w-0 flex-col gap-2">
      <PageTitle>
        Salg
      </PageTitle>
    </div>
  );

  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6">
      <AppPageHeader>{header}</AppPageHeader>
      <OrganizationAuthGate>
        <InvoicesContent />
      </OrganizationAuthGate>
    </section>
  );
}
