"use client";

import { getUserErrorMessage } from "@/lib/user-errors";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboardIcon, PencilIcon, RefreshCwIcon, SaveIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { useAccess, useLocationAccess, usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { layoutDashboardWidgets } from "@/lib/dashboard/layout";
import { rangePresets, type DashboardRange, type DashboardScope, type RangePreset, type WidgetInstance } from "@/lib/dashboard/types";
import type { DashboardRecord } from "@/lib/dashboard/dashboard-record";
import { useDashboardNow } from "@/lib/dashboard/use-dashboard-now";
import { AddWidgetDialog } from "./add-widget-dialog";
import { DashboardGrid } from "./dashboard-grid";
import { DashboardTabs } from "./dashboard-tabs";
import { RangeSelector } from "./range-selector";
import { ScopeSelector } from "./scope-selector";
import { ShareDialog } from "./share-dialog";

const LAST_VIEWED_DASHBOARD_KEY = "engine.dashboard.last-viewed";
type SearchParamsLike = { get: (name: string) => string | null; toString: () => string };

function validRangePreset(value: string | null): value is RangePreset {
  return value !== null && (rangePresets as readonly string[]).includes(value);
}

function validScopeLevel(value: string | null): DashboardScope["level"] | undefined {
  return value === "organization" || value === "market" || value === "operator" || value === "location"
    ? value
    : undefined;
}

function rangeFromUrl(params: SearchParamsLike, fallback: DashboardRange) {
  const preset = params.get("range");
  if (!validRangePreset(preset)) return fallback;
  if (preset !== "custom") return { preset };
  return {
    preset,
    from: params.get("from") ?? fallback.from,
    to: params.get("to") ?? fallback.to,
  };
}

function scopeFromUrl(params: SearchParamsLike, fallback: DashboardScope): DashboardScope {
  const mode = params.get("mode");
  const locations = params.get("loc");
  const level = validScopeLevel(params.get("level"));
  const parentId = params.get("parent") ?? undefined;
  if (mode !== "compare" && mode !== "aggregate" && locations === null && !level && !parentId) {
    return fallback;
  }
  const locationIds = locations
    ? locations.split(",").map((value) => value.trim()).filter(Boolean) as Id<"locations">[]
    : fallback.locationIds;
  return {
    mode: mode === "compare" ? "compare" : "aggregate",
    locationIds,
    ...(level ? { level } : {}),
    ...(parentId ? { parentId } : {}),
  };
}

function pushUrl(router: ReturnType<typeof useRouter>, pathname: string, params: URLSearchParams) {
  const query = params.toString();
  router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
}

function DashboardLanding() {
  const access = useAccess();
  const canView = usePermission("dashboard.view");
  const canManage = usePermission("dashboard.manage");
  const router = useRouter();
  const dashboards = useQuery(api.dashboard.list, canView ? {} : "skip");
  const initialize = useMutation(api.dashboard.initialize);
  const initialized = useRef(false);
  const resolved = useRef(false);
  const [initializing, setInitializing] = useState(false);

  useEffect(() => {
    if (!dashboards || dashboards.dashboards.length > 0 || !canManage || initialized.current) return;
    initialized.current = true;
    setInitializing(true);
    void initialize({})
      .catch((error) => {
        toast.error(getUserErrorMessage(error, "Dashboardet kunne ikke gemmes. Prøv igen."));
      })
      .finally(() => setInitializing(false));
  }, [canManage, dashboards, initialize]);

  useEffect(() => {
    if (!dashboards || !dashboards.dashboards.length || resolved.current) return;
    resolved.current = true;
    const allowed = dashboards.dashboards;
    const lastViewed = window.localStorage.getItem(LAST_VIEWED_DASHBOARD_KEY);
    const selected = allowed.find((dashboard) => String(dashboard.id) === lastViewed)
      ?? allowed.find((dashboard) => dashboard.defaultForRoleIds.includes(dashboards.role))
      ?? (dashboards.singleLocationId
        ? allowed.find((dashboard) => dashboard.defaultForLocationIds.includes(dashboards.singleLocationId!))
        : undefined)
      ?? allowed.find((dashboard) => dashboard.isOrganizationDefault)
      ?? [...allowed].sort((left, right) => left.sortOrder - right.sortOrder)[0];
    if (selected) router.replace(`/dashboard/${selected.id}`);
  }, [dashboards, router]);

  if (!access || dashboards === undefined || initializing) return <Skeleton className="h-96 w-full" />;
  if (!canView) {
    return <Alert variant="destructive" className="max-w-xl"><AlertTitle>Ingen adgang</AlertTitle><AlertDescription>Du har ikke adgang til at se dashboardet.</AlertDescription></Alert>;
  }
  if (!dashboards.dashboards.length) {
    return (
      <Empty className="min-h-80 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><LayoutDashboardIcon /></EmptyMedia>
          <EmptyTitle>Ingen dashboards</EmptyTitle>
          <EmptyDescription>Der er ikke oprettet et dashboard, du kan se.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return <Skeleton className="h-96 w-full" />;
}

function DashboardContent({ dashboardId }: { dashboardId: string }) {
  const access = useAccess();
  const canView = usePermission("dashboard.view");
  const canManage = usePermission("dashboard.manage");
  const canShare = usePermission("dashboard.share");
  const canManageIntegrations = usePermission("integrations.manage");
  const canViewLegacySales = usePermission("dashboard.viewSales");
  const canViewAggregateSales = usePermission("sales.viewAggregate");
  const canViewDetailedSales = usePermission("sales.viewDetail");
  const canViewSales = canViewLegacySales || canViewAggregateSales || canViewDetailedSales;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { locations } = useLocationAccess();
  const dashboardsQuery = useQuery(api.dashboard.list, canView ? {} : "skip");
  const dashboardQuery = useQuery(api.dashboard.get, canView ? { dashboardId: dashboardId as Id<"dashboards"> } : "skip");
  const organizationContext = useQuery(api.employees.getContext, canView ? {} : "skip");
  const saveConfig = useMutation(api.dashboard.saveConfigRevisioned);
  const saveDefaults = useMutation(api.dashboard.saveDefaults);
  const requestDataSync = useMutation(api.dashboard.requestDataSync);
  const [dashboard, setDashboard] = useState<DashboardRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [updatingData, setUpdatingData] = useState(false);
  const [manualNow, setManualNow] = useState(0);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const pendingSaveCount = useRef(0);
  const pendingConfigSave = useRef<Promise<void>>(Promise.resolve());
  const lastConfigSaveFailure = useRef<{ error: unknown } | null>(null);
  const expectedUpdatedAt = useRef<number | null>(null);
  const dashboardNow = useDashboardNow();
  const now = Math.max(dashboardNow, manualNow);

  useEffect(() => {
    if (!dashboardQuery || pendingSaveCount.current > 0) return;
    const next = dashboardQuery as DashboardRecord;
    if (expectedUpdatedAt.current !== null && next.updatedAt < expectedUpdatedAt.current) return;
    setDashboard(next);
    expectedUpdatedAt.current = next.updatedAt;
  }, [dashboardQuery]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setHeaderTarget(document.getElementById("dashboard-shell-header")));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (dashboardsQuery?.dashboards.some((candidate) => String(candidate.id) === dashboardId)) {
      window.localStorage.setItem(LAST_VIEWED_DASHBOARD_KEY, dashboardId);
    }
  }, [dashboardId, dashboardsQuery]);

  const currentScope = dashboard ? scopeFromUrl(searchParams, dashboard.defaultScope) : null;
  const currentRange = dashboard ? rangeFromUrl(searchParams, dashboard.defaultRange) : null;

  function updateRange(next: DashboardRange) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", next.preset);
    if (next.preset === "custom") {
      if (next.from) params.set("from", next.from); else params.delete("from");
      if (next.to) params.set("to", next.to); else params.delete("to");
    } else {
      params.delete("from");
      params.delete("to");
    }
    pushUrl(router, pathname, params);
  }

  function updateScope(next: DashboardScope) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.mode === "compare") params.set("mode", "compare"); else params.delete("mode");
    if (next.locationIds?.length) params.set("loc", next.locationIds.join(",")); else params.delete("loc");
    if (next.level) params.set("level", next.level); else params.delete("level");
    if (next.parentId) params.set("parent", next.parentId); else params.delete("parent");
    pushUrl(router, pathname, params);
  }

  function commitWidgets(nextWidgets: WidgetInstance[]) {
    if (!dashboard) return;
    const optimistic = { ...dashboard, widgets: nextWidgets };
    setDashboard(optimistic);
    pendingSaveCount.current += 1;
    const save: Promise<void> = pendingConfigSave.current
      .catch(() => undefined)
      .then(async (): Promise<void> => {
        const revision = expectedUpdatedAt.current ?? dashboard.updatedAt;
        const updatedAt = await saveConfig({
          dashboardId: dashboard.id,
          widgets: nextWidgets,
          expectedUpdatedAt: revision,
        });
        lastConfigSaveFailure.current = null;
        expectedUpdatedAt.current = updatedAt;
        setDashboard((current) => current ? { ...current, updatedAt } : current);
      })
      .catch((error): void => {
        lastConfigSaveFailure.current = { error };
        toast.error(getUserErrorMessage(error, "Dashboardet kunne ikke gemmes. Prøv igen."));
      })
      .finally(() => {
        pendingSaveCount.current -= 1;
      });
    pendingConfigSave.current = save;
  }

  async function flushConfigSave() {
    await pendingConfigSave.current;
    if (lastConfigSaveFailure.current) {
      throw lastConfigSaveFailure.current.error;
    }
  }

  async function saveCurrentDefaults() {
    if (!dashboard || !currentScope || !currentRange) return;
    try {
      await flushConfigSave();
      const updatedAt = await saveDefaults({
        dashboardId: dashboard.id,
        defaultScope: currentScope,
        defaultRange: currentRange,
        expectedUpdatedAt: expectedUpdatedAt.current ?? dashboard.updatedAt,
      });
      expectedUpdatedAt.current = updatedAt;
      setDashboard((current) => current ? { ...current, defaultScope: currentScope, defaultRange: currentRange, updatedAt } : current);
      toast.success("Lokationsvalg og periode er gemt som standard");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Dashboardet kunne ikke gemmes. Prøv igen."));
    }
  }

  async function updateDashboardData() {
    if (!dashboard || !currentScope) return;
    setUpdatingData(true);
    try {
      try {
        await flushConfigSave();
      } catch {
        return;
      }
      const result = await requestDataSync({
        dashboardId: dashboard.id,
        scope: currentScope,
      });
      setManualNow(Date.now());
      const states = [result.onlinePos, result.workfeed].flatMap((source) =>
        source ? [source.state] : [],
      );
      const updating = states.some(
        (state) => state === "queued" || state === "alreadyQueued",
      );
      const blocked = states.some(
        (state) => state === "rateLimited" || state === "unavailable",
      );
      if (updating && blocked) {
        toast.warning("Dashboardet opdateres kun delvist. En integration kunne ikke startes");
      } else if (states.includes("queued")) {
        toast.success("Opdateringen er sat i gang");
      } else if (states.includes("alreadyQueued")) {
        toast.info("Dashboarddata opdateres allerede");
      } else if (states.includes("rateLimited")) {
        toast.info("Dashboarddata blev opdateret for nylig. Prøv igen om få minutter");
      } else if (states.includes("unavailable")) {
        toast.error("Dashboardets dataintegration er ikke aktiv");
      } else {
        toast.success("Dashboardet er opdateret");
      }
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Dashboarddata kunne ikke opdateres. Prøv igen.",
        ),
      );
    } finally {
      setUpdatingData(false);
    }
  }

  function changeDashboard(nextId: string) {
    const query = searchParams.toString();
    router.push(query ? `/dashboard/${nextId}?${query}` : `/dashboard/${nextId}`, { scroll: false });
  }

  const title = currentScope ? (
    <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Dashboard</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{dashboard?.name ?? "Dashboard"}</h1>
      </div>
      <ScopeSelector scope={currentScope} locations={locations} onChange={updateScope} />
    </div>
  ) : null;

  if (!access || !canView) {
    return canView ? <Skeleton className="h-96" /> : <Alert variant="destructive" className="max-w-xl"><AlertTitle>Ingen adgang</AlertTitle><AlertDescription>Du har ikke adgang til at se dashboardet.</AlertDescription></Alert>;
  }
  if (!dashboard || !currentScope || !currentRange || dashboardsQuery === undefined || locations === undefined) return <Skeleton className="h-96 w-full" />;
  const dashboardList = dashboardsQuery.dashboards as DashboardRecord[];

  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <header className="md:hidden">{title}</header>
      {headerTarget && title ? createPortal(title, headerTarget) : null}
      <DashboardTabs
        key={dashboardList.map((candidate) => `${candidate.id}:${candidate.updatedAt}`).join("|")}
        dashboards={dashboardList}
        activeId={dashboardId}
        canManage={canManage}
        onChange={changeDashboard}
        onReordered={() => undefined}
        onSettingsSaved={(next) => {
          expectedUpdatedAt.current = next.updatedAt;
          setDashboard((current) => current?.id === next.id ? next : current);
        }}
        onDuplicated={(nextId) => changeDashboard(nextId)}
        onDeleted={() => router.replace("/dashboard")}
        onCreated={(nextId) => router.replace(`/dashboard/${nextId}`)}
      />
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <RangeSelector range={currentRange} onChange={updateRange} timeZone={organizationContext?.timeZone} />
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageIntegrations ? (
            <Button type="button" size="lg" variant="outline" className="min-h-11" disabled={updatingData} onClick={() => void updateDashboardData()}>
              {updatingData ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
              {updatingData ? "Opdaterer" : "Opdatér"}
            </Button>
          ) : null}
          {canShare ? <ShareDialog dashboardId={dashboard.id} dashboardName={dashboard.name} onBeforeCreate={flushConfigSave} /> : null}
          {canManage ? (
            <>
              {editing ? <Button type="button" size="lg" variant="outline" className="min-h-11" onClick={() => void saveCurrentDefaults()}><SaveIcon data-icon="inline-start" />Gem som standard</Button> : null}
              <Button type="button" size="lg" className="min-h-11" variant={editing ? "default" : "outline"} onClick={() => setEditing((value) => !value)}>
                <PencilIcon data-icon="inline-start" />
                {editing ? "Færdig" : "Redigér"}
              </Button>
              {editing ? <AddWidgetDialog canViewSensitive={canViewSales} scope={currentScope} range={currentRange} now={now} onAdd={(widget) => commitWidgets(layoutDashboardWidgets([...dashboard.widgets, widget]))} /> : null}
            </>
          ) : null}
        </div>
      </div>
      {dashboard.widgets.length ? (
        <DashboardGrid widgets={dashboard.widgets} scope={currentScope} range={currentRange} now={now} editable={canManage && editing} onChange={commitWidgets} />
      ) : (
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><LayoutDashboardIcon /></EmptyMedia>
            <EmptyTitle>Dashboardet er tomt</EmptyTitle>
            <EmptyDescription>{canManage ? "Tilføj den første widget for at bygge dit dashboard." : "Dette dashboard har ingen widgets endnu."}</EmptyDescription>
          </EmptyHeader>
          {canManage ? <EmptyContent><AddWidgetDialog canViewSensitive={canViewSales} scope={currentScope} range={currentRange} now={now} onAdd={(widget) => commitWidgets([widget])} /></EmptyContent> : null}
        </Empty>
      )}
    </section>
  );
}

export function DashboardPage({ dashboardId }: { dashboardId?: string } = {}) {
  return (
    <OrganizationAuthGate>
      {dashboardId ? <DashboardContent key={dashboardId} dashboardId={dashboardId} /> : <DashboardLanding />}
    </OrganizationAuthGate>
  );
}
