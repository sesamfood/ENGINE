"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { AppSectionNav } from "@/components/app-page-header";
import { SectionNav } from "@/components/section-nav";
import { useAccess, useKioskPage, usePermission } from "@/components/app-shell";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { HistoryIcon, ShoppingCartIcon } from "lucide-react";

const OrderingPlanner = dynamic(
  () =>
    import("@/components/ordering/ordering-planner").then(
      (module) => module.OrderingPlanner,
    ),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);
const OrderingHistory = dynamic(
  () =>
    import("@/components/ordering/ordering-history").then(
      (module) => module.OrderingHistory,
    ),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

function OrderingContent() {
  const pathname = usePathname();
  const access = useAccess();
  const canPlan = usePermission("ordering.plan");
  const showNew = useKioskPage("ordering.new");
  const showHistory = useKioskPage("ordering.history");
  const activeTab = pathname === "/ordering/history" ? "history" : "new";

  if (!access) return <Skeleton className="h-96 w-full" />;

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
  return (
    <>
      <AppSectionNav>
        <SectionNav label="Bestillingssektioner" items={navItems} className="mx-auto w-full max-w-(--container-page)" />
      </AppSectionNav>
      {activeTab === "new" ? (
        <OrderingPlanner />
      ) : (
        <OrderingHistory />
      )}
    </>
  );
}

export default function OrderingPage() {
  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-4">
      <OrganizationAuthGate>
        <OrderingContent />
      </OrganizationAuthGate>
    </section>
  );
}
