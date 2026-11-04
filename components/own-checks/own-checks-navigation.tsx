"use client";

import { BookOpenIcon, ClipboardCheckIcon, FileCheck2Icon, ListChecksIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppSectionNav } from "@/components/app-page-header";
import { SectionNav } from "@/components/section-nav";
import { useKiosk, usePermission } from "@/components/app-shell";

export function OwnChecksNavigation() {
  const pathname = usePathname();
  const router = useRouter();
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
  const showGuidance = kioskMode
    ? Boolean(kiosk?.settings?.enabledPages.includes("ownChecks.guidance"))
    : canToday || canOverview || canDocumentation;
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

  if (sectionCount <= 1) return null;

  const items = [
    ...(showToday ? [{ href: "/own-checks", label: "I dag", icon: ClipboardCheckIcon, active: value === "today" }] : []),
    ...(showOverview ? [{ href: "/own-checks/overview", label: "Oversigt", icon: ListChecksIcon, active: value === "overview" }] : []),
    ...(showDocumentation ? [{ href: "/own-checks/documentation", label: "Dokumentation", icon: FileCheck2Icon, active: value === "documentation" }] : []),
    ...(showGuidance ? [{ href: "/own-checks/guidance", label: "Vejledning", icon: BookOpenIcon, active: value === "guidance" }] : []),
  ];

  return (
    <>
      <AppSectionNav>
        <SectionNav label="Egenkontrolsektioner" items={items} className="mx-auto w-full max-w-(--container-page)" />
      </AppSectionNav>
    </>
  );
}
