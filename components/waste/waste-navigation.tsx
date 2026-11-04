"use client";

import { AppBottomBar } from "@/components/app-bottom-bar";
import { AppSectionNav } from "@/components/app-page-header";
import { SectionNav } from "@/components/section-nav";

import { useKiosk, usePermission } from "@/components/app-shell";
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

  const items = [
    ...(showRegister
      ? [{ href: "/waste", label: "Registrér", icon: Trash2Icon, active: value === "register" }]
      : []),
    ...(showBadDelivery
      ? [{ href: "/waste/bad-delivery", label: "Dårlig levering", icon: PackageXIcon, active: value === "badDelivery" }]
      : []),
    ...(canReport
      ? [{ href: "/waste/report", label: "Rapport", icon: ChartNoAxesColumnIcon, active: value === "report" }]
      : []),
  ];

  return (
    <>
      {showSectionTabs ? (
        <AppSectionNav>
          <SectionNav label="Waste-sektioner" items={items} className="mx-auto w-full max-w-(--container-page)" />
        </AppSectionNav>
      ) : null}
      <AppBottomBar className={value !== "badDelivery" ? "md:hidden" : undefined}>
        <div className="mx-auto flex w-full max-w-(--container-page) flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
          {showSectionTabs ? (
            <SectionNav label="Waste-sektioner" items={items} className="md:hidden" />
          ) : null}
          {value === "badDelivery" ? (
            <div
              id="bad-delivery-primary-action"
              className="w-full sm:ml-auto sm:w-auto"
            />
          ) : null}
        </div>
      </AppBottomBar>
    </>
  );
}
