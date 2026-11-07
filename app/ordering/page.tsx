"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { SectionNav } from "@/components/section-nav";
import { useAccess, useKioskPage, usePermission } from "@/components/app-shell";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BottomBarSkeleton, FieldSkeleton, LocationHeaderSkeleton, OrderingChoiceSkeleton, TableSkeleton } from "@/components/page-skeletons";
import { HistoryIcon, ShoppingCartIcon } from "lucide-react";

const tabSkeletons = {
  new: (
    <>
      <LocationHeaderSkeleton title="Bestilling" />
      <OrderingChoiceSkeleton />
      <BottomBarSkeleton />
    </>
  ),
  history: (
    <>
      <LocationHeaderSkeleton title="Bestillingshistorik" />
      <div className="flex flex-col gap-5 sm:flex-row">
        <FieldSkeleton className="sm:max-w-60" />
        <FieldSkeleton className="sm:max-w-60" />
      </div>
      <TableSkeleton />
      <BottomBarSkeleton />
    </>
  ),
};

const OrderingPlanner = dynamic(
  () =>
    import("@/components/ordering/ordering-planner").then(
      (module) => module.OrderingPlanner,
    ),
  { loading: () => tabSkeletons.new },
);
const OrderingHistory = dynamic(
  () =>
    import("@/components/ordering/ordering-history").then(
      (module) => module.OrderingHistory,
    ),
  { loading: () => tabSkeletons.history },
);

function OrderingContent() {
  const pathname = usePathname();
  const access = useAccess();
  const canPlan = usePermission("ordering.plan");
  const showNew = useKioskPage("ordering.new");
  const showHistory = useKioskPage("ordering.history");
  const activeTab = pathname === "/ordering/history" ? "history" : "new";

  if (!access) return tabSkeletons[activeTab];

  if (!canPlan) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at planlægge eller se bestillinger.
        </AlertDescription>
      </Alert>
    );
  }

  const navItems = [
    ...(showNew
      ? [{ href: "/ordering", label: "Ny bestilling", shortLabel: "Ny", icon: ShoppingCartIcon, active: activeTab === "new" }]
      : []),
    ...(showHistory
      ? [{ href: "/ordering/history", label: "Bestillingshistorik", shortLabel: "Historik", icon: HistoryIcon, active: activeTab === "history" }]
      : []),
  ];
  const navigation = <SectionNav label="Bestillingssektioner" items={navItems} />;
  return activeTab === "new" ? (
    <OrderingPlanner navigation={navigation} />
  ) : (
    <>
      <OrderingHistory />
      <AppBottomBar>
        <div className="mx-auto w-full max-w-(--container-page)">{navigation}</div>
      </AppBottomBar>
    </>
  );
}

export default function OrderingPage() {
  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6">
      <OrganizationAuthGate>
        <OrderingContent />
      </OrganizationAuthGate>
    </section>
  );
}
