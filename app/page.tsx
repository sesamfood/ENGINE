"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { canViewDashboard } from "@/lib/auth-permissions";

export default function Home() {
  const router = useRouter();
  const membership = authClient.useActiveMemberRole();
  const kiosk = useQuery(api.kiosk.getRuntimeContext);

  useEffect(() => {
    if (membership.isPending || kiosk === undefined) return;
    router.replace(
      !kiosk?.isKioskAccount && canViewDashboard(membership.data?.role)
        ? "/dashboard"
        : "/transfers",
    );
  }, [kiosk, membership.data?.role, membership.isPending, router]);

  return (
    <main className="grid min-h-80 place-items-center" aria-label="Åbner startside">
      <Spinner />
    </main>
  );
}
