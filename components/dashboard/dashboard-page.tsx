"use client";

import { useEffect, useRef, useState } from "react";
import { LayoutDashboardIcon, PencilIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { canShareDashboard, canViewDashboard } from "@/lib/auth-permissions";
import { layoutDashboardWidgets } from "@/lib/dashboard/layout";
import { metricRegistry } from "@/lib/dashboard/registry";
import type { DashboardConfig, DashboardRange, DashboardScope, WidgetInstance } from "@/lib/dashboard/types";
import { useDashboardNow } from "@/lib/dashboard/use-dashboard-now";
import { AddWidgetDialog } from "./add-widget-dialog";
import { DashboardGrid } from "./dashboard-grid";
import { RangeSelector } from "./range-selector";
import { ScopeSelector } from "./scope-selector";
import { ShareDialog } from "./share-dialog";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Dashboardet kunne ikke gemmes";
}

function DashboardContent() {
  const membership = authClient.useActiveMemberRole();
  const config = useQuery(api.dashboard.getConfig, canViewDashboard(membership.data?.role) ? {} : "skip");
  const locations = useQuery(api.locations.listLocationOptions, canViewDashboard(membership.data?.role) ? {} : "skip");
  const saveConfig = useMutation(api.dashboard.saveConfig);
  const [local, setLocal] = useState<DashboardConfig | null>(null);
  const [editing, setEditing] = useState(false);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const current = useRef<DashboardConfig | null>(null);
  const now = useDashboardNow();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setHeaderTarget(document.getElementById("dashboard-shell-header")));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!config) return;
    const hasRestrictedWidget =
      membership.data?.role !== "admin" &&
      current.current?.widgets.some(
        (widget) => metricRegistry[widget.metricId].adminOnly,
      );
    if (!current.current || current.current.updatedAt !== config.updatedAt || hasRestrictedWidget) {
      const allowedWidgets = config.widgets.filter(
        (widget) =>
          membership.data?.role === "admin" ||
          !metricRegistry[widget.metricId].adminOnly,
      );
      const normalized = { ...config, widgets: layoutDashboardWidgets(allowedWidgets) };
      current.current = normalized;
      setLocal(normalized);
    }
  }, [config, membership.data?.role]);

  if (membership.isPending) return <Skeleton className="h-96" />;
  if (!canViewDashboard(membership.data?.role)) {
    return <Alert variant="destructive" className="max-w-xl"><AlertTitle>Ingen adgang</AlertTitle><AlertDescription>Kun ledere og administratorer kan se dashboardet.</AlertDescription></Alert>;
  }
  if (!local || locations === undefined) return <Skeleton className="h-96" />;

  function commit(next: DashboardConfig) {
    current.current = next;
    setLocal(next);
    void saveConfig({ widgets: next.widgets, scope: next.scope, range: next.range }).catch((error) => toast.error(message(error)));
  }

  function widgets(next: WidgetInstance[]) {
    if (!current.current) return;
    commit({ ...current.current, widgets: next });
  }

  function scope(next: DashboardScope) {
    if (!current.current) return;
    commit({ ...current.current, scope: next });
  }

  function range(next: DashboardRange) {
    if (!current.current) return;
    commit({ ...current.current, range: next });
  }

  const title = (
    <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Overblik</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Dashboard</h1>
      </div>
      <ScopeSelector scope={local.scope} locations={locations} onChange={scope} />
    </div>
  );

  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <header className="md:hidden">{title}</header>
      {headerTarget ? createPortal(title, headerTarget) : null}
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <RangeSelector range={local.range} onChange={range} />
        </div>
        <div className="flex flex-wrap gap-2">
          {canShareDashboard(membership.data?.role) ? <ShareDialog /> : null}
          <Button type="button" variant={editing ? "default" : "outline"} onClick={() => setEditing((value) => !value)}>
            <PencilIcon data-icon="inline-start" />
            {editing ? "Færdig" : "Rediger"}
          </Button>
          {editing ? <AddWidgetDialog isAdmin={membership.data?.role === "admin"} scope={local.scope} range={local.range} now={now} onAdd={(widget) => widgets(layoutDashboardWidgets([...local.widgets, widget]))} /> : null}
        </div>
      </div>
      {local.widgets.length ? (
        <DashboardGrid widgets={local.widgets} scope={local.scope} range={local.range} now={now} editable={editing} onChange={widgets} />
      ) : (
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><LayoutDashboardIcon /></EmptyMedia>
            <EmptyTitle>Dashboardet er tomt</EmptyTitle>
            <EmptyDescription>Tilføj den første widget for at bygge dit overblik.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><AddWidgetDialog isAdmin={membership.data?.role === "admin"} scope={local.scope} range={local.range} now={now} onAdd={(widget) => widgets([widget])} /></EmptyContent>
        </Empty>
      )}
    </section>
  );
}

export function DashboardPage() {
  return <OrganizationAuthGate><DashboardContent /></OrganizationAuthGate>;
}
