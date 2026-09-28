"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { useAccess, usePermission } from "@/components/app-shell";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const router = useRouter();
  const access = useAccess();
  const canPlan =
    usePermission("ordering.plan") && !access?.kiosk?.kioskModeEnabled;
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

  const navigation = (
    <TabsList
      variant="line"
      aria-label="Bestillingssektioner"
      className="h-12 max-w-full justify-start overflow-x-auto overflow-y-hidden"
    >
      <TabsTrigger value="new" appearance="standard" className="min-w-32">
        Ny bestilling
      </TabsTrigger>
      <TabsTrigger value="history" appearance="standard" className="min-w-36">
        Bestillingshistorik
      </TabsTrigger>
    </TabsList>
  );

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) =>
        router.push(value === "history" ? "/ordering/history" : "/ordering", {
          scroll: false,
        })
      }
    >
      {activeTab === "new" ? (
        <TabsContent value="new">
          <OrderingPlanner navigation={navigation} />
        </TabsContent>
      ) : (
        <TabsContent value="history">
          <OrderingHistory />
          <AppBottomBar>
            <div className="mx-auto w-full max-w-(--container-page)">
              {navigation}
            </div>
          </AppBottomBar>
        </TabsContent>
      )}
    </Tabs>
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
