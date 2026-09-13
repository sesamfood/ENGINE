"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { AppPageHeader } from "@/components/app-page-header";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccess, useKiosk, usePermission } from "@/components/app-shell";

const InvoiceForm = dynamic(
  () =>
    import("@/components/invoices/invoice-form").then(
      (module) => module.InvoiceForm,
    ),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);
const InvoiceHistory = dynamic(
  () =>
    import("@/components/invoices/invoice-history").then(
      (module) => module.InvoiceHistory,
    ),
  { loading: () => <Skeleton className="h-96 w-full" /> },
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

  if (!access) {
    return <Skeleton className="h-80 w-full" />;
  }

  if (!showNew && !showHistory) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at registrere eller se kvitteringer.
        </AlertDescription>
      </Alert>
    );
  }

  const sectionTabs = showSectionTabs ? (
    <TabsList
      variant="line"
      aria-label="Fakturasektioner"
      className="h-12 max-w-full justify-start overflow-x-auto overflow-y-hidden"
    >
      {showNew ? (
        <TabsTrigger value="new" className="min-w-36 px-4">
          Ny kvittering
        </TabsTrigger>
      ) : null}
      {showHistory ? (
        <TabsTrigger value="history" className="min-w-36 px-4">
          Registrerede kvitteringer
        </TabsTrigger>
      ) : null}
    </TabsList>
  ) : null;

  return (
    <Tabs
      value={selectedTab}
      onValueChange={(value) =>
        router.push(value === "history" ? "/invoices/history" : "/invoices", {
          scroll: false,
        })
      }
    >
      {showNew && selectedTab === "new" ? (
        <TabsContent value="new">
          <InvoiceForm navigation={sectionTabs} />
        </TabsContent>
      ) : null}
      {showHistory && selectedTab === "history" ? (
        <TabsContent value="history">
          <InvoiceHistory />
          {sectionTabs ? (
            <AppBottomBar>
              <div className="mx-auto w-full max-w-[96rem]">{sectionTabs}</div>
            </AppBottomBar>
          ) : null}
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

export default function InvoicesPage() {
  const header = (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">
        Faktura
      </p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Faktura
      </h1>
    </div>
  );

  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <AppPageHeader>{header}</AppPageHeader>
      <OrganizationAuthGate>
        <InvoicesContent />
      </OrganizationAuthGate>
    </section>
  );
}
