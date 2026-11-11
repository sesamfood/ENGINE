"use client";

import { BookOpenIcon, ClipboardCheckIcon, FileCheck2Icon, ListChecksIcon, WheatIcon } from "lucide-react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { SectionNav } from "@/components/section-nav";
import { useKiosk, usePermission } from "@/components/app-shell";
import { api } from "@/convex/_generated/api";

export function OwnChecksNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const kiosk = useKiosk();
  const kioskMode = Boolean(kiosk?.kioskModeEnabled);
  const hiddenPages = useQuery(api.ownCheckTemplates.getHiddenPages);
  const canToday = usePermission("ownChecks.perform");
  const canOverview = usePermission("ownChecks.view");
  const canDocumentation = usePermission("ownChecks.export");
  const canAny = canToday || canOverview || canDocumentation;
  const sections = [
    { id: "ownChecks.today", href: "/own-checks", label: "I dag", icon: ClipboardCheckIcon, allowed: canToday },
    { id: "ownChecks.overview", href: "/own-checks/overview", label: "Oversigt", icon: ListChecksIcon, allowed: canOverview },
    { id: "ownChecks.documentation", href: "/own-checks/documentation", label: "Dokumentation", icon: FileCheck2Icon, allowed: canDocumentation },
    { id: "ownChecks.allergens", href: "/own-checks/allergens", label: "Allergener", icon: WheatIcon, allowed: canAny },
    { id: "ownChecks.guidance", href: "/own-checks/guidance", label: "Vejledning", icon: BookOpenIcon, allowed: canAny },
  ] as const;
  const visible = sections.filter(
    (section) =>
      !hiddenPages?.includes(section.id) &&
      (kioskMode ? Boolean(kiosk?.settings?.enabledPages.includes(section.id)) : section.allowed),
  );
  const matches = (href: string) =>
    href === "/own-checks"
      ? pathname === "/own-checks" || pathname.startsWith("/own-checks/check/")
      : pathname.startsWith(href);
  const active = visible.find((section) => matches(section.href)) ?? visible[0];
  const prefetchKey = visible.map((section) => section.href).join(",");

  useEffect(() => {
    for (const href of prefetchKey.split(",")) if (href) router.prefetch(href);
  }, [prefetchKey, router]);

  const redirectTo = hiddenPages !== undefined && active && !matches(active.href) ? active.href : null;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo, { scroll: false });
  }, [redirectTo, router]);

  if (visible.length <= 1) return null;

  return (
    <AppBottomBar>
      <div className="mx-auto w-full max-w-(--container-page)">
        <SectionNav
          label="Egenkontrolsektioner"
          items={visible.map(({ href, label, icon }) => ({ href, label, icon, active: href === active?.href }))}
        />
      </div>
    </AppBottomBar>
  );
}
