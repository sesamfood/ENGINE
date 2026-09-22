"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { AppPageHeader } from "@/components/app-page-header";
import { useAccess, usePermission } from "@/components/app-shell";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";

const ExpenseForm = dynamic(
  () =>
    import("@/components/expenses/expense-form").then(
      (module) => module.ExpenseForm,
    ),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);
const ExpenseHistory = dynamic(
  () =>
    import("@/components/expenses/expense-history").then(
      (module) => module.ExpenseHistory,
    ),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

function ExpensesContent() {
  const pathname = usePathname();
  const router = useRouter();
  const access = useAccess();
  const canCreate = usePermission("expenses.create");
  const canView = usePermission("expenses.view");
  const organization = authClient.useActiveOrganization();
  const session = authClient.useSession();
  const organizationId = organization.data?.id;
  const sessionId = session.data?.session.id;
  const activeTab = pathname === "/expenses/history" ? "history" : "new";
  const selectedTab =
    activeTab === "history" && canView
      ? "history"
      : canCreate
        ? "new"
        : "history";

  useEffect(() => {
    if ((!canCreate && !canView) || activeTab === selectedTab) return;
    router.replace(
      selectedTab === "history" ? "/expenses/history" : "/expenses",
    );
  }, [activeTab, canCreate, canView, router, selectedTab]);

  if (!access || !organizationId || !sessionId) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (!canCreate && !canView) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at oprette eller se udgifter.
        </AlertDescription>
      </Alert>
    );
  }

  const navigation =
    canCreate && canView ? (
      <TabsList
        variant="line"
        aria-label="Udgiftssektioner"
        className="h-12 max-w-full justify-start overflow-x-auto overflow-y-hidden"
      >
        <TabsTrigger value="new" appearance="standard" className="min-w-32">
          Opret udgift
        </TabsTrigger>
        <TabsTrigger value="history" appearance="standard" className="min-w-32">
          Udgifter
        </TabsTrigger>
      </TabsList>
    ) : null;

  return (
    <Tabs
      key={`${organizationId}:${sessionId}`}
      value={selectedTab}
      onValueChange={(value) =>
        router.push(value === "history" ? "/expenses/history" : "/expenses", {
          scroll: false,
        })
      }
    >
      {canCreate && selectedTab === "new" ? (
        <TabsContent value="new">
          <ExpenseForm
            organizationId={organizationId}
            navigation={navigation}
          />
        </TabsContent>
      ) : null}
      {canView && selectedTab === "history" ? (
        <TabsContent value="history">
          <ExpenseHistory organizationId={organizationId} />
          {navigation ? (
            <AppBottomBar>
              <div className="mx-auto w-full max-w-(--container-page)">{navigation}</div>
            </AppBottomBar>
          ) : null}
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

export default function ExpensesPage() {
  const pathname = usePathname();
  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-4 pb-(--spacing-safe-actions-tall) sm:pb-(--spacing-safe-actions-compact)">
      <AppPageHeader>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Udgift
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {pathname === "/expenses/history" ? "Udgifter" : "Opret udgift"}
          </h1>
        </div>
      </AppPageHeader>
      <OrganizationAuthGate>
        <ExpensesContent />
      </OrganizationAuthGate>
    </section>
  );
}
