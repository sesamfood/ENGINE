"use client";

import { BookOpenIcon, ClipboardCheckIcon, FileCheck2Icon, ListChecksIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useKiosk, usePermission } from "@/components/app-shell";

export function OwnChecksNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const sidebar = useSidebar();
  const tabsRef = useRef<HTMLDivElement>(null);
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
  const showGuidance = !kioskMode && (canToday || canOverview || canDocumentation);
  const sectionCount =
    Number(showToday) + Number(showOverview) + Number(showDocumentation) + Number(showGuidance);
  const value = pathname.startsWith("/own-checks/guidance") && showGuidance
    ? "guidance"
    : pathname.startsWith("/own-checks/documentation") && showDocumentation
    ? "documentation"
    : pathname.startsWith("/own-checks/overview") && showOverview
      ? "overview"
      : showToday
        ? "today"
        : showOverview
          ? "overview"
          : "documentation";

  useEffect(() => {
    if (showToday) router.prefetch("/own-checks");
    if (showOverview) router.prefetch("/own-checks/overview");
    if (showDocumentation) router.prefetch("/own-checks/documentation");
    if (showGuidance) router.prefetch("/own-checks/guidance");
  }, [router, showDocumentation, showGuidance, showOverview, showToday]);

  useEffect(() => {
    if (value === "today" && pathname.startsWith("/own-checks/check/")) return;
    if (value === "guidance" && pathname.startsWith("/own-checks/guidance")) return;
    if ((value === "today" && pathname === "/own-checks") || (value === "overview" && pathname.startsWith("/own-checks/overview")) || (value === "documentation" && pathname.startsWith("/own-checks/documentation"))) return;
    const href = value === "today" ? "/own-checks" : value === "overview" ? "/own-checks/overview" : "/own-checks/documentation";
    router.replace(href, { scroll: false });
  }, [pathname, router, value]);

  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value, sidebar.isMobile]);

  if (sectionCount <= 1) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:right-0" style={{ left: sidebar.isMobile ? 0 : sidebar.state === "collapsed" ? "var(--sidebar-width-icon)" : "var(--sidebar-width)" }}>
      <div className="mx-auto w-full max-w-[96rem]">
        <Tabs value={value} className="min-w-0" onValueChange={(next) => router.push(next === "today" ? "/own-checks" : next === "overview" ? "/own-checks/overview" : next === "guidance" ? "/own-checks/guidance" : "/own-checks/documentation", { scroll: false })}>
          <TabsList ref={tabsRef} variant="line" aria-label="Egenkontrolsektioner" className="h-12 max-w-full justify-start overflow-x-auto overflow-y-hidden">
            {showToday ? <TabsTrigger value="today" className="min-w-28 px-4"><ClipboardCheckIcon data-icon="inline-start" />I dag</TabsTrigger> : null}
            {showOverview ? <TabsTrigger value="overview" className="min-w-28 px-4"><ListChecksIcon data-icon="inline-start" />Oversigt</TabsTrigger> : null}
            {showDocumentation ? <TabsTrigger value="documentation" className="min-w-36 px-4"><FileCheck2Icon data-icon="inline-start" />Dokumentation</TabsTrigger> : null}
            {showGuidance ? <TabsTrigger value="guidance" className="min-w-28 px-4"><BookOpenIcon data-icon="inline-start" />Vejledning</TabsTrigger> : null}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
