"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { AppPageHeader, AppSectionNav, PageTitle } from "@/components/app-page-header";
import { SectionNav } from "@/components/section-nav";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess, useKiosk, usePermission } from "@/components/app-shell";
import { ArrowRightLeftIcon, HistoryIcon, ShoppingCartIcon } from "lucide-react";
import { api } from "@/convex/_generated/api";

const TransferForm = dynamic(
  () =>
    import("@/components/transfers/transfer-form").then(
      (module) => module.TransferForm,
    ),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);
const InternalOrders = dynamic(
  () =>
    import("@/components/transfers/internal-orders").then(
      (module) => module.InternalOrders,
    ),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);
const TransferHistory = dynamic(
  () =>
    import("@/components/transfers/transfer-history").then(
      (module) => module.TransferHistory,
    ),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

function tabPath(tab: string) {
  return tab === "history"
    ? "/transfers/history"
    : tab === "orders"
      ? "/transfers/orders"
      : "/transfers";
}

function TransfersContent() {
  const pathname = usePathname();
  const router = useRouter();
  const access = useAccess();
  const kiosk = useKiosk();
  const canManage = usePermission("transfers.manage");
  const canView = usePermission("transfers.view");
  const kioskMode = Boolean(kiosk?.kioskModeEnabled);
  const showNew = kioskMode
    ? Boolean(kiosk?.settings?.enabledPages.includes("transfers.new"))
    : canManage;
  const showHistory = kioskMode
    ? Boolean(kiosk?.settings?.enabledPages.includes("transfers.history"))
    : canView;
  // Null when internal orders are off.
  const openOrders = useQuery(
    api.internalOrders.listOpenOrders,
    showNew ? {} : "skip",
  );
  const showOrders = showNew && Boolean(openOrders);
  const activeTab =
    pathname === "/transfers/history"
      ? "history"
      : pathname === "/transfers/orders"
        ? "orders"
        : "new";
  const selectedTab =
    activeTab === "history" && showHistory
      ? "history"
      : activeTab === "orders" &&
          showNew &&
          (showOrders || openOrders === undefined)
        ? "orders"
        : showNew
          ? "new"
          : "history";
  const showSectionTabs =
    Number(showNew) + Number(showOrders) + Number(showHistory) > 1;

  useEffect(() => {
    if (!showNew && !showHistory) return;
    if (activeTab === selectedTab) return;
    router.replace(tabPath(selectedTab));
  }, [activeTab, router, selectedTab, showHistory, showNew]);

  if (!access) {
    return <Skeleton className="h-80 w-full" />;
  }

  if (!showNew && !showHistory) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at oprette eller se transfers.
        </AlertDescription>
      </Alert>
    );
  }

  const navItems = [
    ...(showNew
      ? [{ href: "/transfers", label: "Ny transfer", shortLabel: "Ny", icon: ArrowRightLeftIcon, active: selectedTab === "new" }]
      : []),
    ...(showOrders
      ? [{ href: "/transfers/orders", label: "Transferbestillinger", shortLabel: "Bestillinger", badgeLabel: "åbne transferbestillinger", icon: ShoppingCartIcon, active: selectedTab === "orders", badge: openOrders?.length || undefined }]
      : []),
    ...(showHistory
      ? [{ href: "/transfers/history", label: "Transferhistorik", shortLabel: "Historik", icon: HistoryIcon, active: selectedTab === "history" }]
      : []),
  ];
  const navigation = showSectionTabs ? (
    <SectionNav label="Transfersektioner" items={navItems} className="md:hidden" />
  ) : null;

  return (
    <>
      {showSectionTabs ? (
        <AppSectionNav>
          <SectionNav label="Transfersektioner" items={navItems} className="mx-auto w-full max-w-(--container-page)" />
        </AppSectionNav>
      ) : null}
      {showNew && selectedTab === "new" ? (
        <TransferForm navigation={navigation} />
      ) : null}
      {selectedTab === "orders" ? (
        openOrders ? (
          <InternalOrders orders={openOrders} navigation={navigation} />
        ) : (
          <Skeleton className="h-96 w-full" />
        )
      ) : null}
      {showHistory && selectedTab === "history" ? (
        <>
          <TransferHistory />
          {navigation ? (
            <AppBottomBar className="md:hidden">
              <div className="mx-auto w-full max-w-(--container-page)">
                {navigation}
              </div>
            </AppBottomBar>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export default function TransfersPage() {
  const header = (
    <div className="flex min-w-0 flex-col gap-2">
      <PageTitle>
        Transfer
      </PageTitle>
    </div>
  );

  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-4 pb-(--spacing-safe-actions) sm:pb-(--spacing-safe-actions-compact)">
      <AppPageHeader>{header}</AppPageHeader>
      <OrganizationAuthGate>
        <TransfersContent />
      </OrganizationAuthGate>
    </section>
  );
}
