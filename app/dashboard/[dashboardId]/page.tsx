import { Suspense } from "react";
import { DashboardPage } from "@/components/dashboard/dashboard-page";

export default async function DashboardDetailRoute({
  params,
}: {
  params: Promise<{ dashboardId: string }>;
}) {
  const { dashboardId } = await params;
  return (
    <Suspense fallback={<div className="flex min-h-96 items-center justify-center"><span className="text-sm text-muted-foreground">Indlæser dashboard…</span></div>}>
      <DashboardPage dashboardId={dashboardId} />
    </Suspense>
  );
}
