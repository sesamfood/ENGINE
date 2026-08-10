"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccess, useKiosk, usePermission } from "@/components/app-shell";

const TransferForm = dynamic(
  () => import("@/components/transfers/transfer-form").then((module) => module.TransferForm),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);
const TransferHistory = dynamic(
  () => import("@/components/transfers/transfer-history").then((module) => module.TransferHistory),
  { loading: () => <Skeleton className="h-96 w-full" /> },
);

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
  const activeTab = pathname === "/transfers/history" ? "history" : "new";
  const selectedTab =
    activeTab === "history" && showHistory
      ? "history"
      : showNew
        ? "new"
        : "history";

  useEffect(() => {
    if (!showNew && !showHistory) return;
    if (activeTab === selectedTab) return;
    router.replace(
      selectedTab === "history" ? "/transfers/history" : "/transfers",
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
          Du har ikke adgang til at oprette eller se flytninger.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Tabs value={selectedTab} onValueChange={(value) => router.push(value === "history" ? "/transfers/history" : "/transfers")}>
      <TabsList
        aria-label="Flyttesektioner"
        className="h-14 w-full justify-start overflow-x-auto overflow-y-hidden"
      >
        {showNew ? <TabsTrigger value="new" className="min-w-36 px-6">
          Ny flytning
        </TabsTrigger> : null}
        {showHistory ? <TabsTrigger value="history" className="min-w-36 px-6">
          Flyttehistorik
        </TabsTrigger> : null}
      </TabsList>
      {showNew && selectedTab === "new" ? <TabsContent value="new" className="pt-6">
        <TransferForm />
      </TabsContent> : null}
      {showHistory && selectedTab === "history" ? <TabsContent value="history" className="pt-6">
        <TransferHistory />
      </TabsContent> : null}
    </Tabs>
  );
}

export default function TransfersPage() {
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setHeaderTarget(document.getElementById("transfers-shell-header"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const header = (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">
        Lagerstyring
      </p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Flytninger
      </h1>
    </div>
  );

  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-4">
      <header className="md:hidden">{header}</header>
      {headerTarget ? createPortal(header, headerTarget) : null}
      <OrganizationAuthGate>
        <TransfersContent />
      </OrganizationAuthGate>
    </section>
  );
}
