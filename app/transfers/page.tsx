"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { AppPageHeader } from "@/components/app-page-header";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccess, useKiosk, usePermission } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
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

  const navigation = showSectionTabs ? (
    <TabsList
      variant="line"
      aria-label="Transfersektioner"
      className="h-12 w-full max-w-full justify-start overflow-x-auto overflow-y-hidden sm:w-fit"
      appearance="scrollFadeBelowLg"
    >
      {showNew ? (
        <TabsTrigger value="new" appearance="compact" className="min-w-0 sm:min-w-36">
          <ArrowRightLeftIcon data-icon="inline-start" />
          Ny transfer
        </TabsTrigger>
      ) : null}
      {showOrders ? (
        <TabsTrigger value="orders" appearance="compact" className="min-w-0 sm:min-w-36">
          <ShoppingCartIcon data-icon="inline-start" />
          Bestillinger
          {openOrders?.length ? (
            <Badge>{openOrders.length}</Badge>
          ) : null}
        </TabsTrigger>
      ) : null}
      {showHistory ? (
        <TabsTrigger value="history" appearance="compact" className="min-w-0 sm:min-w-36">
          <HistoryIcon data-icon="inline-start" />
          Transferhistorik
        </TabsTrigger>
      ) : null}
    </TabsList>
  ) : null;

  return (
    <Tabs
      value={selectedTab}
      onValueChange={(value) =>
        router.push(tabPath(value), { scroll: false })
      }
    >
      {showNew && selectedTab === "new" ? (
        <TabsContent value="new">
          <TransferForm navigation={navigation} />
        </TabsContent>
      ) : null}
      {selectedTab === "orders" ? (
        <TabsContent value="orders">
          {openOrders ? (
            <InternalOrders orders={openOrders} navigation={navigation} />
          ) : (
            <Skeleton className="h-96 w-full" />
          )}
        </TabsContent>
      ) : null}
      {showHistory && selectedTab === "history" ? (
        <TabsContent value="history">
          <TransferHistory />
          {navigation ? (
            <AppBottomBar>
              <div className="mx-auto w-full max-w-(--container-page)">
                {navigation}
              </div>
            </AppBottomBar>
          ) : null}
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

export default function TransfersPage() {
  const header = (
    <div className="flex min-w-0 flex-col gap-2">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Transfer
      </h1>
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
