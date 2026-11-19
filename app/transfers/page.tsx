"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { usePathname, useRouter } from "next/navigation";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { AppPageHeader, PageTitle } from "@/components/app-page-header";
import { SectionNav } from "@/components/section-nav";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BottomBarSkeleton, CardGridSkeleton, DateRangeSkeleton, ProductFormSkeleton, RowsSkeleton } from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess, useKiosk, usePermission } from "@/components/app-shell";
import { ArrowRightLeftIcon, ChefHatIcon, HistoryIcon, ShoppingCartIcon } from "lucide-react";
import { api } from "@/convex/_generated/api";

const tabSkeletons = {
  new: (
    <>
      <ProductFormSkeleton fields={4} />
      <BottomBarSkeleton />
    </>
  ),
  orders: (
    <>
      <CardGridSkeleton count={3} cardClassName="h-52" />
      <BottomBarSkeleton />
    </>
  ),
  prepplan: (
    <>
      <RowsSkeleton />
      <BottomBarSkeleton />
    </>
  ),
  history: (
    <div className="flex flex-col gap-6">
      <DateRangeSkeleton />
      <Skeleton className="h-5 w-32" />
      <RowsSkeleton />
      <BottomBarSkeleton />
    </div>
  ),
};

const TransferForm = dynamic(
  () =>
    import("@/components/transfers/transfer-form").then(
      (module) => module.TransferForm,
    ),
  { loading: () => tabSkeletons.new },
);
const InternalOrders = dynamic(
  () =>
    import("@/components/transfers/internal-orders").then(
      (module) => module.InternalOrders,
    ),
  { loading: () => tabSkeletons.orders },
);
const PrepPlan = dynamic(
  () =>
    import("@/components/transfers/prep-plan").then(
      (module) => module.PrepPlan,
    ),
  { loading: () => tabSkeletons.prepplan },
);
const TransferHistory = dynamic(
  () =>
    import("@/components/transfers/transfer-history").then(
      (module) => module.TransferHistory,
    ),
  { loading: () => tabSkeletons.history },
);

const tabPaths = {
  new: "/transfers",
  orders: "/transfers/orders",
  prepplan: "/transfers/prepplan",
  history: "/transfers/history",
} as const;
type Tab = keyof typeof tabPaths;

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
  const canPrepplan = kioskMode
    ? Boolean(kiosk?.settings?.enabledPages.includes("transfers.prepplan"))
    : canManage;
  // Null when Bestilling is off; no suppliers when no order windows are set.
  const prepPlan = useQuery(api.prepPlans.get, canPrepplan ? {} : "skip");
  const showPrepplan = canPrepplan && Boolean(prepPlan?.suppliers.length);
  // Null when internal orders are off.
  const openOrders = useQuery(
    api.internalOrders.listOpenOrders,
    showNew ? {} : "skip",
  );
  const showOrders = showNew && Boolean(openOrders);
  const activeTab: Tab =
    (Object.keys(tabPaths) as Tab[]).find((tab) => tabPaths[tab] === pathname) ??
    "new";
  const selectedTab: Tab =
    activeTab === "history" && showHistory
      ? "history"
      : activeTab === "orders" &&
          showNew &&
          (showOrders || openOrders === undefined)
        ? "orders"
        : activeTab === "prepplan" &&
            canPrepplan &&
            (showPrepplan || prepPlan === undefined)
          ? "prepplan"
          : showNew
            ? "new"
            : showHistory
              ? "history"
              : "prepplan";
  const showSectionTabs =
    Number(showNew) +
      Number(showOrders) +
      Number(showPrepplan) +
      Number(showHistory) >
    1;
  const hasAccess = showNew || showHistory || canPrepplan;

  useEffect(() => {
    if (!hasAccess) return;
    if (activeTab === selectedTab) return;
    router.replace(tabPaths[selectedTab]);
  }, [activeTab, hasAccess, router, selectedTab]);

  if (!access) return tabSkeletons[activeTab];

  if (!hasAccess) {
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
    ...(showPrepplan
      ? [{ href: "/transfers/prepplan", label: "Prepplan", icon: ChefHatIcon, active: selectedTab === "prepplan" }]
      : []),
    ...(showHistory
      ? [{ href: "/transfers/history", label: "Transferhistorik", shortLabel: "Historik", icon: HistoryIcon, active: selectedTab === "history" }]
      : []),
  ];
  const navigation = showSectionTabs ? (
    <SectionNav label="Transfersektioner" items={navItems} />
  ) : null;
  return (
    <>
      {showNew && selectedTab === "new" ? (
        <TransferForm navigation={navigation} />
      ) : null}
      {selectedTab === "orders" ? (
        openOrders ? (
          <InternalOrders orders={openOrders} navigation={navigation} />
        ) : (
          tabSkeletons.orders
        )
      ) : null}
      {selectedTab === "prepplan" ? (
        prepPlan ? (
          <PrepPlan navigation={navigation} />
        ) : prepPlan === null ? (
          <Alert className="max-w-xl">
            <AlertTitle>Prepplan er ikke tilgængelig</AlertTitle>
            <AlertDescription>
              Prepplan bruger interne bestillinger, som kræver Bestilling.
            </AlertDescription>
          </Alert>
        ) : (
          tabSkeletons.prepplan
        )
      ) : null}
      {showHistory && selectedTab === "history" ? (
        <>
          <TransferHistory />
          {navigation ? (
            <AppBottomBar>
              <div className="mx-auto w-full max-w-(--container-page)">{navigation}</div>
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
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6">
      <AppPageHeader>{header}</AppPageHeader>
      <OrganizationAuthGate>
        <TransfersContent />
      </OrganizationAuthGate>
    </section>
  );
}
