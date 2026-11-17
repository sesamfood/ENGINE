"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PencilIcon, TargetIcon } from "lucide-react";
import { toast } from "sonner";
import { AppPageHeader, PageTitle } from "@/components/app-page-header";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { useAccess, usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { layoutDashboardWidgets } from "@/lib/dashboard/layout";
import type { DashboardRange, WidgetInstance } from "@/lib/dashboard/types";
import type { DashboardRecord } from "@/lib/dashboard/dashboard-record";
import { useDashboardNow } from "@/lib/dashboard/use-dashboard-now";
import { getUserErrorMessage } from "@/lib/user-errors";
import { DashboardGrid } from "./dashboard-grid";
import { DashboardSkeleton, pushUrl } from "./dashboard-page";
import { DashboardTabs, TARGETS_TAB } from "./dashboard-tabs";

const AddWidgetDialog = dynamic(() => import("./add-widget-dialog").then((module) => module.AddWidgetDialog));

type Board = { locationId: Id<"locations">; widgets: WidgetInstance[]; updatedAt: number };

function TargetDashboardContent() {
  const access = useAccess();
  const canView = usePermission("dashboard.view");
  const canManage = usePermission("dashboard.manage") && !access?.kiosk?.kioskModeEnabled;
  const canViewLegacySales = usePermission("dashboard.viewSales");
  const canViewAggregateSales = usePermission("sales.viewAggregate");
  const canViewDetailedSales = usePermission("sales.viewDetail");
  const canViewSales = canViewLegacySales || canViewAggregateSales || canViewDetailedSales;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dashboards = useQuery(api.dashboard.list, canView ? {} : "skip");
  const targets = useQuery(api.targetDashboards.list, canView ? {} : "skip");
  const requestedLocation = searchParams.get("loc")?.split(",")[0];
  const locationId = targets?.locations.find((location) => location.id === requestedLocation)?.id
    ?? targets?.locations[0]?.id;
  const boardQuery = useQuery(api.targetDashboards.get, locationId ? { locationId } : "skip");
  const saveLayout = useMutation(api.targetDashboards.saveLayout);
  const [board, setBoard] = useState<Board | null>(null);
  const [editing, setEditing] = useState(false);
  const pendingSaves = useRef(0);
  const pendingSave = useRef<Promise<void>>(Promise.resolve());
  const expectedUpdatedAt = useRef<number | null>(null);
  const now = useDashboardNow();

  useEffect(() => {
    if (!boardQuery || !locationId || pendingSaves.current > 0) return;
    if (board?.locationId === locationId && expectedUpdatedAt.current !== null && boardQuery.updatedAt < expectedUpdatedAt.current) return;
    setBoard({ locationId, ...boardQuery });
    expectedUpdatedAt.current = boardQuery.updatedAt;
  }, [board?.locationId, boardQuery, locationId]);

  // Target widgets carry their own period; added widgets default to today.
  const range: DashboardRange = { preset: "today" };

  function updateParams(update: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    update(params);
    pushUrl(router, pathname, params);
  }

  function commitWidgets(widgets: WidgetInstance[]) {
    if (!board) return;
    const { locationId: boardLocationId } = board;
    setBoard({ ...board, widgets });
    pendingSaves.current += 1;
    pendingSave.current = pendingSave.current
      .catch(() => undefined)
      .then(async () => {
        const updatedAt = await saveLayout({
          locationId: boardLocationId,
          widgets,
          expectedUpdatedAt: expectedUpdatedAt.current ?? board.updatedAt,
        });
        expectedUpdatedAt.current = updatedAt;
        setBoard((current) => current?.locationId === boardLocationId ? { ...current, updatedAt } : current);
      })
      .catch((error) => {
        toast.error(getUserErrorMessage(error, "Dashboardet kunne ikke gemmes. Prøv igen."));
      })
      .finally(() => {
        pendingSaves.current -= 1;
      });
  }

  if (access && !canView) {
    return <Alert variant="destructive" className="max-w-xl"><AlertTitle>Ingen adgang</AlertTitle><AlertDescription>Du har ikke adgang til at se dashboardet.</AlertDescription></Alert>;
  }
  if (!access || !dashboards || !targets || (locationId && boardQuery !== null && board?.locationId !== locationId)) return <DashboardSkeleton />;

  const canEdit = targets.canEdit && Boolean(board);
  const query = searchParams.toString();
  const scope = { mode: "aggregate" as const, locationIds: locationId ? [locationId] : [], level: "location" as const };

  return (
    <section className="mx-auto flex w-full max-w-(--container-dashboard) flex-col gap-4 lg:gap-6">
      <AppPageHeader>
        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <PageTitle>Dashboard</PageTitle>
          {targets.locations.length ? (
            <Select
              items={targets.locations.map((location) => ({ value: location.id, label: location.name }))}
              value={locationId}
              onValueChange={(value) => { if (value) updateParams((params) => params.set("loc", value)); }}
            >
              <SelectTrigger className="h-11 w-full md:w-64" aria-label="Vælg lokation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {targets.locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </AppPageHeader>
      <DashboardTabs
        dashboards={dashboards.dashboards as DashboardRecord[]}
        activeId={TARGETS_TAB}
        canManage={canManage}
        showTargets
        onChange={(nextId) => {
          if (nextId !== TARGETS_TAB) router.push(query ? `/dashboard/${nextId}?${query}` : `/dashboard/${nextId}`, { scroll: false });
        }}
        onReordered={() => undefined}
        onSettingsSaved={() => undefined}
        onDuplicated={(nextId) => router.push(`/dashboard/${nextId}`)}
        onDeleted={() => undefined}
        onCreated={(nextId) => router.push(`/dashboard/${nextId}`)}
      />
      {board && locationId && boardQuery !== null ? (
        <>
          {canEdit ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {editing ? (
                <AddWidgetDialog
                  canViewSensitive={canViewSales}
                  scope={scope}
                  range={range}
                  now={now}
                  onAdd={(widget) => commitWidgets(layoutDashboardWidgets([...board.widgets, widget]))}
                />
              ) : null}
              <Button type="button" size="lg" className="min-h-11" variant={editing ? "default" : "outline"} onClick={() => setEditing((value) => !value)}>
                <PencilIcon data-icon="inline-start" />
                {editing ? "Færdig" : "Redigér"}
              </Button>
            </div>
          ) : null}
          <DashboardGrid
            widgets={board.widgets}
            scope={scope}
            range={range}
            now={now}
            editable={canEdit && editing}
            lockTargetWidgets
            onChange={commitWidgets}
          />
        </>
      ) : (
        <Empty appearance="outlined" className="min-h-80">
          <EmptyHeader>
            <EmptyMedia variant="icon"><TargetIcon /></EmptyMedia>
            <EmptyTitle>Ingen mål endnu</EmptyTitle>
            <EmptyDescription>Når en manager sætter mål for en lokation, vises fremskridtet her.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}

export function TargetDashboardPage() {
  return (
    <OrganizationAuthGate>
      <TargetDashboardContent />
    </OrganizationAuthGate>
  );
}
