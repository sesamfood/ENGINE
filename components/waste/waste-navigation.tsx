"use client";

import { AppBottomBar } from "@/components/app-bottom-bar";

import { useKiosk, usePermission } from "@/components/app-shell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartNoAxesColumnIcon, PackageXIcon, Trash2Icon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export function WasteNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const kiosk = useKiosk();
  const canRegister = usePermission("waste.register");
  const canReportPermission = usePermission("waste.report");
  const kioskMode = Boolean(kiosk?.kioskModeEnabled);
  const showRegister = kioskMode
    ? pathname === "/waste" ||
      Boolean(kiosk?.settings?.enabledPages.includes("waste.register"))
    : canRegister;
  const showBadDelivery = kioskMode
    ? Boolean(kiosk?.settings?.enabledPages.includes("waste.badDelivery"))
    : canRegister;
  const canReport = kioskMode
    ? Boolean(kiosk?.settings?.enabledPages.includes("waste.report"))
    : canReportPermission;
  const sectionCount =
    Number(showRegister) + Number(showBadDelivery) + Number(canReport);
  const value =
    pathname.startsWith("/waste/report") && canReport
      ? "report"
      : pathname.startsWith("/waste/bad-delivery") && showBadDelivery
        ? "badDelivery"
        : showRegister
          ? "register"
          : showBadDelivery
            ? "badDelivery"
            : "report";
  const showSectionTabs = sectionCount > 1;

  useEffect(() => {
    if (showRegister) router.prefetch("/waste");
    if (showBadDelivery) router.prefetch("/waste/bad-delivery");
    if (canReport) router.prefetch("/waste/report");
  }, [canReport, router, showBadDelivery, showRegister]);

  useEffect(() => {
    if (!showRegister && !showBadDelivery && !canReport) return;
    if (
      (pathname === "/waste" && value === "register") ||
      (pathname.startsWith("/waste/bad-delivery") && value === "badDelivery") ||
      (pathname.startsWith("/waste/report") && value === "report")
    ) {
      return;
    }
    const href =
      value === "report"
        ? "/waste/report"
        : value === "badDelivery"
          ? "/waste/bad-delivery"
          : "/waste";
    router.replace(href, { scroll: false });
  }, [canReport, pathname, router, showBadDelivery, showRegister, value]);

  if (!showSectionTabs && value !== "badDelivery") return null;

  return (
    <AppBottomBar>
      <div className="mx-auto flex w-full max-w-[96rem] flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
        {showSectionTabs ? (
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
            <TabsList
              variant="line"
              aria-label="Waste-sektioner"
              className="h-12 max-w-full justify-start overflow-x-auto overflow-y-hidden"
            >
              {showRegister ? (
                <TabsTrigger value="register" className="min-w-28 px-4">
                  <Trash2Icon data-icon="inline-start" />
                  Registrér
                </TabsTrigger>
              ) : null}
              {showBadDelivery ? (
                <TabsTrigger value="badDelivery" className="min-w-28 px-4">
                  <PackageXIcon data-icon="inline-start" />
                  Dårlig levering
                </TabsTrigger>
              ) : null}
              {canReport ? (
                <TabsTrigger value="report" className="min-w-28 px-4">
                  <ChartNoAxesColumnIcon data-icon="inline-start" />
                  Rapport
                </TabsTrigger>
              ) : null}
            </TabsList>
          </Tabs>
        ) : null}
        {value === "badDelivery" ? (
          <div
            id="bad-delivery-primary-action"
            className="w-full sm:ml-auto sm:w-auto"
          />
        ) : null}
      </div>
    </AppBottomBar>
  );
}
