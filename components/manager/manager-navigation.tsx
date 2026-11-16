"use client";

import { TargetIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { SectionNav } from "@/components/section-nav";

export function ManagerNavigation() {
  const pathname = usePathname();
  const items = [
    { href: "/manager/targets", label: "Mål", icon: TargetIcon, active: pathname.startsWith("/manager/targets") },
  ];
  return (
    <AppBottomBar>
      <div className="mx-auto flex w-full max-w-(--container-page)">
        <SectionNav label="Manager-sektioner" items={items} />
      </div>
    </AppBottomBar>
  );
}
