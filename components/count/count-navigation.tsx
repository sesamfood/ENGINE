"use client";

import { BoxesIcon, ClipboardListIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useKiosk, usePermission } from "@/components/app-shell";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { AppSectionNav } from "@/components/app-page-header";
import { SectionNav } from "@/components/section-nav";

export function CountNavigation({ action }: { action?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const kiosk = useKiosk();
  const canRegister = usePermission("count.register");
  const canStock = usePermission("count.viewStock");
  const showCount = kiosk?.kioskModeEnabled
    ? pathname === "/count" ||
      kiosk.settings?.enabledPages.includes("count.register")
    : canRegister;
  const showStock = kiosk?.kioskModeEnabled
    ? kiosk.settings?.enabledPages.includes("count.stock")
    : canStock;
  const showSectionTabs = Number(showCount) + Number(showStock) > 1;

  useEffect(() => {
    if (showCount) router.prefetch("/count");
    if (showStock) router.prefetch("/count/stock");
  }, [router, showCount, showStock]);

  if (!showSectionTabs && !action) return null;

  const onStock = pathname.startsWith("/count/stock");
  const items = [
    ...(showCount
      ? [{ href: "/count", label: "Registrér", icon: ClipboardListIcon, active: !onStock }]
      : []),
    ...(showStock
      ? [{ href: "/count/stock", label: "Lager", icon: BoxesIcon, active: onStock }]
      : []),
  ];

  return (
    <>
      {showSectionTabs ? (
        <AppSectionNav>
          <SectionNav label="Count-sektioner" items={items} className="mx-auto w-full max-w-(--container-page)" />
        </AppSectionNav>
      ) : null}
      {action ? (
        <AppBottomBar>
          <div className="mx-auto flex w-full max-w-(--container-page) items-stretch justify-end sm:items-center">
            <div className="sm:ml-auto">{action}</div>
          </div>
        </AppBottomBar>
      ) : null}
    </>
  );
}
