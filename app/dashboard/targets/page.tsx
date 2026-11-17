import { Suspense } from "react";
import { TargetDashboardPage } from "@/components/dashboard/target-dashboard";

export default function TargetDashboardRoute() {
  return (
    <Suspense fallback={<div className="flex min-h-96 items-center justify-center"><span className="text-sm text-muted-foreground">Indlæser dashboard…</span></div>}>
      <TargetDashboardPage />
    </Suspense>
  );
}
