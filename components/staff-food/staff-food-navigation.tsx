"use client";

import { ChartNoAxesColumnIcon, UtensilsIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { useKiosk, useKioskPage, usePermission } from "@/components/app-shell";
import { AppSectionNav } from "@/components/app-page-header";
import { SectionNav } from "@/components/section-nav";

export function StaffFoodNavigation({ action }: { action?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const kiosk = useKiosk();
  const canRegister = usePermission("staffFood.register");
  const canReport = usePermission("staffFood.report");
  const kioskMode = Boolean(kiosk?.kioskModeEnabled);
  const registerEnabled = useKioskPage("staffFood.register");
  const showRegister = kioskMode ? registerEnabled : canRegister;
  const reportEnabled = useKioskPage("staffFood.report");
  const showReport = reportEnabled && canReport;
  const showSectionTabs = showRegister && showReport;

  useEffect(() => {
    if (!showSectionTabs) return;
    router.prefetch("/staff-food");
    router.prefetch("/staff-food/report");
  }, [router, showSectionTabs]);

  if (!showSectionTabs && !action) return null;

  const onReport = pathname.startsWith("/staff-food/report");
  const items = [
    { href: "/staff-food", label: "Registrér", icon: UtensilsIcon, active: !onReport },
    { href: "/staff-food/report", label: "Rapport", icon: ChartNoAxesColumnIcon, active: onReport },
  ];

  return (
    <>
      {showSectionTabs ? (
        <AppSectionNav>
          <SectionNav label="Staff food-sektioner" items={items} className="mx-auto w-full max-w-(--container-page)" />
        </AppSectionNav>
      ) : null}
      {action ? (
        <AppBottomBar>
          <div className="mx-auto flex w-full max-w-(--container-page) items-center">
            {action}
          </div>
        </AppBottomBar>
      ) : null}
    </>
  );
}
