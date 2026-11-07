"use client";

import { Fragment, useEffect } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { AppPageHeader, PageTitle } from "@/components/app-page-header";
import { useAccess, useKioskPage, usePermission } from "@/components/app-shell";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { SectionNav } from "@/components/section-nav";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BottomBarSkeleton, ExpenseFormSkeleton, FieldSkeleton, TableSkeleton } from "@/components/page-skeletons";
import { authClient } from "@/lib/auth-client";
import { useActiveOrganization } from "@/lib/active-organization";
import { HistoryIcon, PlusIcon } from "lucide-react";

const tabSkeletons = {
  new: <ExpenseFormSkeleton />,
  history: (
    <div className="flex flex-col gap-5">
      <FieldSkeleton className="max-w-sm" />
      <TableSkeleton />
      <BottomBarSkeleton />
    </div>
  ),
};

const ExpenseForm = dynamic(
  () =>
    import("@/components/expenses/expense-form").then(
      (module) => module.ExpenseForm,
    ),
  { loading: () => tabSkeletons.new },
);
const ExpenseHistory = dynamic(
  () =>
    import("@/components/expenses/expense-history").then(
      (module) => module.ExpenseHistory,
    ),
  { loading: () => tabSkeletons.history },
);

function ExpensesContent() {
  const pathname = usePathname();
  const router = useRouter();
  const access = useAccess();
  const createEnabled = useKioskPage("expenses.new");
  const historyEnabled = useKioskPage("expenses.history");
  const canCreate = usePermission("expenses.create") && createEnabled;
  const canView = usePermission("expenses.view") && historyEnabled;
  const organization = useActiveOrganization();
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

  if (!access || !organizationId || !sessionId) return tabSkeletons[activeTab];
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
      <SectionNav
        label="Udgiftssektioner"
        items={[
          { href: "/expenses", label: "Opret udgift", icon: PlusIcon, active: selectedTab === "new" },
          { href: "/expenses/history", label: "Udgifter", icon: HistoryIcon, active: selectedTab === "history" },
        ]}
      />
    ) : null;

  return (
    <Fragment key={`${organizationId}:${sessionId}`}>
      {canCreate && selectedTab === "new" ? (
        <ExpenseForm organizationId={organizationId} navigation={navigation} />
      ) : null}
      {canView && selectedTab === "history" ? (
        <>
          <ExpenseHistory organizationId={organizationId} />
          {navigation ? (
            <AppBottomBar>
              <div className="mx-auto w-full max-w-(--container-page)">{navigation}</div>
            </AppBottomBar>
          ) : null}
        </>
      ) : null}
    </Fragment>
  );
}

export default function ExpensesPage() {
  const pathname = usePathname();
  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6">
      <AppPageHeader>
        <PageTitle>
          {pathname === "/expenses/history" ? "Udgifter" : "Opret udgift"}
        </PageTitle>
      </AppPageHeader>
      <OrganizationAuthGate>
        <ExpensesContent />
      </OrganizationAuthGate>
    </section>
  );
}
