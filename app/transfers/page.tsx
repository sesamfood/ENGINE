"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { TransferForm } from "@/components/transfers/transfer-form";
import { TransferHistory } from "@/components/transfers/transfer-history";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { canManageTransfers } from "@/lib/auth-permissions";

function TransfersContent() {
  const membership = authClient.useActiveMemberRole();
  const pathname = usePathname();
  const router = useRouter();
  const kiosk = useQuery(api.kiosk.getRuntimeContext);
  const showNew = !kiosk?.kioskModeEnabled || kiosk.settings?.enabledPages.includes("transfers.new");
  const showHistory = !kiosk?.kioskModeEnabled || kiosk.settings?.enabledPages.includes("transfers.history");

  if (membership.isPending) {
    return <Skeleton className="h-80 w-full" />;
  }

  if (!canManageTransfers(membership.data?.role) && !kiosk?.kioskModeEnabled) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at oprette eller se transfers.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Tabs value={pathname === "/transfers/history" ? "history" : "new"} onValueChange={(value) => router.push(value === "history" ? "/transfers/history" : "/transfers")}>
      <TabsList
        aria-label="Transfersektioner"
        className="h-14 w-full justify-start overflow-x-auto overflow-y-hidden"
      >
        {showNew ? <TabsTrigger value="new" className="min-w-36 px-6">
          Ny transfer
        </TabsTrigger> : null}
        {showHistory ? <TabsTrigger value="history" className="min-w-36 px-6">
          Transfer historik
        </TabsTrigger> : null}
      </TabsList>
      {showNew ? <TabsContent value="new" className="pt-6">
        <TransferForm />
      </TabsContent> : null}
      {showHistory ? <TabsContent value="history" className="pt-6">
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
        Transfers
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
