"use client";

import { ClipboardCheckIcon, FileCheck2Icon, ListChecksIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useKiosk, usePermission } from "@/components/app-shell";

export function OwnChecksNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const sidebar = useSidebar();
  const kiosk = useKiosk();
  const kioskMode = Boolean(kiosk?.kioskModeEnabled);
  const canToday = usePermission("ownChecks.perform");
  const canOverview = usePermission("ownChecks.view");
  const canDocumentation = usePermission("ownChecks.export");
  const showToday = kioskMode
    ? Boolean(kiosk?.settings?.enabledPages.includes("ownChecks.today"))
    : canToday;
  const showOverview = kioskMode
    ? Boolean(kiosk?.settings?.enabledPages.includes("ownChecks.overview"))
    : canOverview;
  const showDocumentation = kioskMode
    ? Boolean(kiosk?.settings?.enabledPages.includes("ownChecks.documentation"))
    : canDocumentation;
  const value = pathname.startsWith("/own-checks/documentation") && showDocumentation
    ? "documentation"
    : pathname.startsWith("/own-checks/overview") && showOverview
      ? "overview"
      : showToday
        ? "today"
        : showOverview
          ? "overview"
          : "documentation";

  useEffect(() => {
    if ((value === "today" && pathname === "/own-checks") || (value === "overview" && pathname.startsWith("/own-checks/overview")) || (value === "documentation" && pathname.startsWith("/own-checks/documentation"))) return;
    const href = value === "today" ? "/own-checks" : value === "overview" ? "/own-checks/overview" : "/own-checks/documentation";
    router.replace(href, { scroll: false });
  }, [pathname, router, value]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:right-0" style={{ left: sidebar.isMobile ? 0 : sidebar.state === "collapsed" ? "var(--sidebar-width-icon)" : "var(--sidebar-width)" }}>
      <div className="mx-auto w-full max-w-[96rem]">
        <Tabs value={value} onValueChange={(next) => router.push(next === "today" ? "/own-checks" : next === "overview" ? "/own-checks/overview" : "/own-checks/documentation", { scroll: false })}>
          <TabsList variant="line" aria-label="Egenkontrolsektioner" className="h-12 max-w-full justify-start overflow-x-auto overflow-y-hidden">
            {showToday ? <TabsTrigger value="today" className="min-w-28 px-4"><ClipboardCheckIcon data-icon="inline-start" />I dag</TabsTrigger> : null}
            {showOverview ? <TabsTrigger value="overview" className="min-w-28 px-4"><ListChecksIcon data-icon="inline-start" />Oversigt</TabsTrigger> : null}
            {showDocumentation ? <TabsTrigger value="documentation" className="min-w-36 px-4"><FileCheck2Icon data-icon="inline-start" />Dokumentation</TabsTrigger> : null}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
