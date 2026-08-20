"use client";

import {
  ChartNoAxesColumnIcon,
  PackageXIcon,
  Trash2Icon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useKiosk, usePermission } from "@/components/app-shell";

export function WasteNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const sidebar = useSidebar();
  const kiosk = useKiosk();
  const canRegister = usePermission("waste.register");
  const canReportPermission = usePermission("waste.report");
  const kioskMode = Boolean(kiosk?.kioskModeEnabled);
  const showRegister = kioskMode
    ? pathname === "/waste" || Boolean(kiosk?.settings?.enabledPages.includes("waste.register"))
    : canRegister;
  const showBadDelivery = kioskMode
    ? Boolean(kiosk?.settings?.enabledPages.includes("waste.badDelivery"))
    : canRegister;
  const canReport = kioskMode
    ? Boolean(kiosk?.settings?.enabledPages.includes("waste.report"))
    : canReportPermission;
  const value = pathname.startsWith("/waste/report") && canReport
    ? "report"
    : pathname.startsWith("/waste/bad-delivery") && showBadDelivery
      ? "badDelivery"
      : showRegister
        ? "register"
        : showBadDelivery
          ? "badDelivery"
          : "report";

  useEffect(() => {
    if (!showRegister && !showBadDelivery && !canReport) return;
    if (
      (pathname === "/waste" && value === "register") ||
      (pathname.startsWith("/waste/bad-delivery") && value === "badDelivery") ||
      (pathname.startsWith("/waste/report") && value === "report")
    ) {
      return;
    }
    const href = value === "report"
      ? "/waste/report"
      : value === "badDelivery"
        ? "/waste/bad-delivery"
        : "/waste";
    router.replace(href, { scroll: false });
  }, [canReport, pathname, router, showBadDelivery, showRegister, value]);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-10 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:right-0"
      style={{
        left: sidebar.isMobile
          ? 0
          : sidebar.state === "collapsed"
            ? "var(--sidebar-width-icon)"
            : "var(--sidebar-width)",
      }}
    >
      <div className="mx-auto flex w-full max-w-[96rem] flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
        <Tabs
          value={value}
          onValueChange={(next) => {
            const href =
              next === "report"
                ? "/waste/report"
                : next === "badDelivery"
                  ? "/waste/bad-delivery"
                  : "/waste";
            router.push(href, { scroll: false });
          }}
        >
          <TabsList variant="line" aria-label="Waste-sektioner" className="h-12 max-w-full justify-start overflow-x-auto overflow-y-hidden">
            {showRegister ? <TabsTrigger value="register" className="min-w-28 px-4">
              <Trash2Icon data-icon="inline-start" />
              Registrér
            </TabsTrigger> : null}
            {showBadDelivery ? <TabsTrigger value="badDelivery" className="min-w-28 px-4">
              <PackageXIcon data-icon="inline-start" />
              Dårlig levering
            </TabsTrigger> : null}
            {canReport ? (
              <TabsTrigger value="report" className="min-w-28 px-4">
                <ChartNoAxesColumnIcon data-icon="inline-start" />
                Rapport
              </TabsTrigger>
            ) : null}
          </TabsList>
        </Tabs>
        {value === "badDelivery" ? (
          <div
            id="bad-delivery-primary-action"
            className="w-full sm:ml-auto sm:w-auto"
          />
        ) : null}
      </div>
    </div>
  );
}
