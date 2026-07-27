"use client";

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

  if (membership.isPending) {
    return <Skeleton className="h-80 w-full" />;
  }

  if (!canManageTransfers(membership.data?.role)) {
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
    <Tabs defaultValue="new">
      <TabsList
        aria-label="Transfersektioner"
        className="h-14 w-full justify-start overflow-x-auto overflow-y-hidden"
      >
        <TabsTrigger value="new" className="min-w-36 px-6">
          Ny transfer
        </TabsTrigger>
        <TabsTrigger value="history" className="min-w-36 px-6">
          Transfer historik
        </TabsTrigger>
      </TabsList>
      <TabsContent value="new" className="pt-6">
        <TransferForm />
      </TabsContent>
      <TabsContent value="history" className="pt-6">
        <TransferHistory />
      </TabsContent>
    </Tabs>
  );
}

export default function TransfersPage() {
  return (
    <section className="mx-auto w-full max-w-[96rem]">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Transfers
      </h1>
      <div className="mt-8">
        <OrganizationAuthGate>
          <TransfersContent />
        </OrganizationAuthGate>
      </div>
    </section>
  );
}
